import Foundation

#if canImport(Security)
import Security
#endif

public enum OperatorKeychainHelperConstants {
    public static let protocolVersion = "operator-keychain-helper.v1"
    public static let operation = "store-generic-password"
    public static let service = "digital.apidevelopers.operator-gateway"
    public static let account = "github-app-private-key"
    public static let accessScope = "current-user"
    public static let maximumSecretBytes = 8_192
}

public enum OperatorKeychainHelperError: Error, Equatable {
    case invalidArguments
    case invalidProtocol
    case invalidDescriptor
    case invalidSecret
    case storageDisabled
    case duplicateItem
    case storageFailed
}

public struct OperatorKeychainHelperInvocation: Equatable {
    public let service: String
    public let account: String
    public let secret: Data

    public init(arguments: [String], stdin: Data) throws {
        let expected = [
            OperatorKeychainHelperConstants.operation,
            "--protocol",
            OperatorKeychainHelperConstants.protocolVersion,
            "--service",
            OperatorKeychainHelperConstants.service,
            "--account",
            OperatorKeychainHelperConstants.account,
            "--access-scope",
            OperatorKeychainHelperConstants.accessScope,
            "--create-only",
            "--no-secret-output",
        ]

        guard arguments == expected else {
            throw OperatorKeychainHelperError.invalidArguments
        }

        guard !stdin.isEmpty,
              stdin.count <= OperatorKeychainHelperConstants.maximumSecretBytes
        else {
            throw OperatorKeychainHelperError.invalidSecret
        }

        service = OperatorKeychainHelperConstants.service
        account = OperatorKeychainHelperConstants.account
        secret = stdin
    }
}

public struct OperatorKeychainHelperResponse: Codable, Equatable {
    public let protocolVersion: String
    public let created: Bool
    public let replaced: Bool
    public let secretReturned: Bool

    enum CodingKeys: String, CodingKey {
        case protocolVersion = "protocol"
        case created
        case replaced
        case secretReturned
    }

    public init(
        protocolVersion: String = OperatorKeychainHelperConstants.protocolVersion,
        created: Bool = true,
        replaced: Bool = false,
        secretReturned: Bool = false
    ) {
        self.protocolVersion = protocolVersion
        self.created = created
        self.replaced = replaced
        self.secretReturned = secretReturned
    }
}

public protocol OperatorKeychainStoring {
    func storeGenericPassword(
        service: String,
        account: String,
        secret: Data
    ) throws
}

public struct OperatorDisabledKeychainStore: OperatorKeychainStoring {
    public init() {}

    public func storeGenericPassword(
        service: String,
        account: String,
        secret: Data
    ) throws {
        throw OperatorKeychainHelperError.storageDisabled
    }
}

public struct OperatorSecurityFrameworkKeychainStore: OperatorKeychainStoring {
    public init() {}

    public func storeGenericPassword(
        service: String,
        account: String,
        secret: Data
    ) throws {
        #if OPERATOR_KEYCHAIN_REAL_STORAGE_ENABLED && canImport(Security)
        let attributes: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
            kSecValueData as String: secret,
            kSecAttrSynchronizable as String: false,
        ]

        let status = SecItemAdd(attributes as CFDictionary, nil)

        if status == errSecDuplicateItem {
            throw OperatorKeychainHelperError.duplicateItem
        }

        guard status == errSecSuccess else {
            throw OperatorKeychainHelperError.storageFailed
        }
        #else
        throw OperatorKeychainHelperError.storageDisabled
        #endif
    }
}

public func executeOperatorKeychainHelper(
    arguments: [String],
    stdin: Data,
    store: OperatorKeychainStoring
) throws -> OperatorKeychainHelperResponse {
    let invocation = try OperatorKeychainHelperInvocation(
        arguments: arguments,
        stdin: stdin
    )
    var temporarySecret = Data(invocation.secret)

    defer {
        temporarySecret.resetBytes(in: 0..<temporarySecret.count)
    }

    try store.storeGenericPassword(
        service: invocation.service,
        account: invocation.account,
        secret: temporarySecret
    )

    return OperatorKeychainHelperResponse()
}
