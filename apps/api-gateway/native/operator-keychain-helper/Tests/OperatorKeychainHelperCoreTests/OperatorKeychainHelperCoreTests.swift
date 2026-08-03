import Foundation
import XCTest
@testable import OperatorKeychainHelperCore

final class OperatorKeychainHelperCoreTests: XCTestCase {
    private let validArguments = [
        "store-generic-password",
        "--protocol",
        "operator-keychain-helper.v1",
        "--service",
        "digital.apidevelopers.operator-gateway",
        "--account",
        "github-app-private-key",
        "--access-scope",
        "current-user",
        "--create-only",
        "--no-secret-output",
    ]

    func testAcceptsOnlyTheExactProtocol() throws {
        let invocation = try OperatorKeychainHelperInvocation(
            arguments: validArguments,
            stdin: Data("synthetic-private-key".utf8)
        )

        XCTAssertEqual(
            invocation.service,
            OperatorKeychainHelperConstants.service
        )
        XCTAssertEqual(
            invocation.account,
            OperatorKeychainHelperConstants.account
        )
    }

    func testRejectsMutatedOrAdditionalArguments() {
        var mutated = validArguments
        mutated[2] = "operator-keychain-helper.v2"

        XCTAssertThrowsError(
            try OperatorKeychainHelperInvocation(
                arguments: mutated,
                stdin: Data("synthetic".utf8)
            )
        )

        XCTAssertThrowsError(
            try OperatorKeychainHelperInvocation(
                arguments: validArguments + ["--extra"],
                stdin: Data("synthetic".utf8)
            )
        )
    }

    func testRejectsEmptyAndOversizedSecrets() {
        XCTAssertThrowsError(
            try OperatorKeychainHelperInvocation(
                arguments: validArguments,
                stdin: Data()
            )
        )

        XCTAssertThrowsError(
            try OperatorKeychainHelperInvocation(
                arguments: validArguments,
                stdin: Data(
                    repeating: 0x41,
                    count: OperatorKeychainHelperConstants.maximumSecretBytes + 1
                )
            )
        )
    }

    func testDefaultSecurityFrameworkStoreIsDisabled() {
        #if !OPERATOR_KEYCHAIN_REAL_STORAGE_ENABLED
        XCTAssertThrowsError(
            try OperatorSecurityFrameworkKeychainStore().storeGenericPassword(
                service: OperatorKeychainHelperConstants.service,
                account: OperatorKeychainHelperConstants.account,
                secret: Data("synthetic".utf8)
            )
        ) { error in
            XCTAssertEqual(
                error as? OperatorKeychainHelperError,
                .storageDisabled
            )
        }
        #endif
    }

    func testSyntheticStoreReturnsTheExactSanitizedResponse() throws {
        final class Store: OperatorKeychainStoring {
            var capturedService: String?
            var capturedAccount: String?
            var capturedSecret: Data?

            func storeGenericPassword(
                service: String,
                account: String,
                secret: Data
            ) throws {
                capturedService = service
                capturedAccount = account
                capturedSecret = Data(secret)
            }
        }

        let store = Store()
        let response = try executeOperatorKeychainHelper(
            arguments: validArguments,
            stdin: Data("synthetic-private-key".utf8),
            store: store
        )

        XCTAssertEqual(
            response,
            OperatorKeychainHelperResponse()
        )
        XCTAssertEqual(
            store.capturedService,
            OperatorKeychainHelperConstants.service
        )
        XCTAssertEqual(
            store.capturedAccount,
            OperatorKeychainHelperConstants.account
        )
        XCTAssertEqual(
            store.capturedSecret,
            Data("synthetic-private-key".utf8)
        )
    }
}
