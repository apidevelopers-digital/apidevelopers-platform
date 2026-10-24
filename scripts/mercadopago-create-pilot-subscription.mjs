import fs from "node:fs";

const token = process.env.MP_ACCESS_TOKEN;
const sellerId = String(process.env.MP_EXPECTED_TEST_USER_ID || "").trim();
if (!token || !sellerId) process.exit(10);

const H = {accept:"application/json", authorization:`Bearer ${token}`};
const planReason = "uni.verso start - piloto de teste API Developers";
const externalReference = "pilot-subscription-buyer-3608645861-universo-start-20260812";
const payerEmail = "test@testuser.com";
const backUrl = "https://sitedauni.com/apps/universo/";

const getJson = async (url) => {
  const r = await fetch(url,{headers:H});
  if (!r.ok) throw new Error(`GET ${r.status}`);
  return r.json();
};

const me = await getJson("https://api.mercadopago.com/users/me");
if (String(me?.id ?? "").trim() !== sellerId) process.exit(11);

const pu = new URL("https://api.mercadopago.com/preapproval_plan/search");
pu.searchParams.set("q", planReason);
const pp = await getJson(pu);
const plans = (Array.isArray(pp?.results)?pp.results:[]).filter(x =>
  String(x?.reason ?? "").trim() === planReason &&
  Number(x?.auto_recurring?.transaction_amount) === 49 &&
  String(x?.auto_recurring?.currency_id ?? "") === "BRL" &&
  Number(x?.auto_recurring?.frequency) === 1 &&
  String(x?.auto_recurring?.frequency_type ?? "") === "months"
);
if (plans.length !== 1) {
  console.error(JSON.stringify({ok:false,stage:"plan",exactMatches:plans.length}));
  process.exit(12);
}
const planId = String(plans[0].id);

const su = new URL("https://api.mercadopago.com/preapproval/search");
su.searchParams.set("q", externalReference);
su.searchParams.set("payer_email", payerEmail);
su.searchParams.set("preapproval_plan_id", planId);
const sp = await getJson(su);
const existing = (Array.isArray(sp?.results)?sp.results:[]).filter(x =>
  String(x?.external_reference ?? "") === externalReference &&
  String(x?.preapproval_plan_id ?? "") === planId
);
if (existing.length > 1) {
  console.error(JSON.stringify({ok:false,stage:"dedupe",exactMatches:existing.length}));
  process.exit(13);
}

let s = existing[0] ?? null;
let created = false;
if (!s) {
  const r = await fetch("https://api.mercadopago.com/preapproval",{
    method:"POST",
    headers:{...H,"content-type":"application/json"},
    body:JSON.stringify({
      preapproval_plan_id: planId,
      payer_email: payerEmail,
      reason: planReason,
      external_reference: externalReference,
      back_url: backUrl
    })
  });
  const text = await r.text();
  let p = null;
  try { p = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok) {
    console.error(JSON.stringify({ok:false,stage:"create",httpStatus:r.status,error:p?.error??null,message:p?.message??null}));
    process.exit(14);
  }
  s = p;
  created = true;
}

const id = String(s?.id ?? "").trim();
const initPoint = String(s?.init_point ?? "").trim();
const returnedPlanId = String(s?.preapproval_plan_id ?? "").trim();
const collector = String(s?.collector_id ?? "").trim();
const status = String(s?.status ?? "").trim();
if (!id || !initPoint || returnedPlanId !== planId) process.exit(15);
if (collector && collector !== sellerId) process.exit(16);
if (status === "authorized") process.exit(17);

const evidence = {
  ok:true, created, object:"preapproval", mode:"test-account",
  sellerMatched:true,
  buyerTestUserId:"3608645861",
  buyerBinding:"pending-checkout",
  payerEmail, externalReference,
  plan:{id:planId,reason:planReason,amount:49,currency:"BRL",frequency:1,frequencyType:"months"},
  subscription:{id,status,initPoint,preapprovalPlanId:returnedPlanId},
  cardTokenUsed:false,
  paymentCreatedByThisStep:false,
  realChargeCreatedByThisStep:false
};
fs.mkdirSync("artifacts",{recursive:true});
fs.writeFileSync("artifacts/mercadopago-pilot-subscription.json",JSON.stringify(evidence,null,2)+"\n");
console.log(JSON.stringify({ok:true,created,status,buyerBinding:"pending-checkout",paymentCreatedByThisStep:false}));
