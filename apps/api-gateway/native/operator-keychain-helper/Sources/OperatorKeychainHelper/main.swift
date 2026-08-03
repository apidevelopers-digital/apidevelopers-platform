import Foundation
import OperatorKeychainHelperCore

private struct SanitizedFailure: Codable {
    let protocolVersion: String
    let ok: Bool
    let code: String

    enum CodingKeys: String, CodingKey {
        case protocolVersion = "protocol"
        case ok
        case code
    }
}

private func emitJSON<T: Encodable>(_ value: T, to handle: FileHandle) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]

    guard let data = try? encoder.encode(value) else {
        return
    }

    handle.write(data)
    handle.write(Data([0x0A]))
}

let arguments = Array(CommandLine.arguments.dropFirst())
var stdin = FileHandle.standardInput.readDataToEndOfFile()

defer {
    stdin.resetBytes(in: 0..<stdin.count)
}

do {
    let response = try executeOperatorKeychainHelper(
        arguments: arguments,
        stdin: stdin,
        store: OperatorSecurityFrameworkKeychainStore()
    )

    emitJSON(response, to: FileHandle.standardOutput)
    exit(EXIT_SUCCESS)
} catch let error as OperatorKeychainHelperError {
    let code: String

    switch error {
    case .invalidArguments:
        code = "invalid_arguments"
    case .invalidProtocol:
        code = "invalid_protocol"
    case .invalidDescriptor:
        code = "invalid_descriptor"
    case .invalidSecret:
        code = "invalid_secret"
    case .storageDisabled:
        code = "storage_disabled"
    case .duplicateItem:
        code = "duplicate_item"
    case .storageFailed:
        code = "storage_failed"
    }

    emitJSON(
        SanitizedFailure(
            protocolVersion: OperatorKeychainHelperConstants.protocolVersion,
            ok: false,
            code: code
        ),
        to: FileHandle.standardError
    )
    exit(EXIT_FAILURE)
} catch {
    emitJSON(
        SanitizedFailure(
            protocolVersion: OperatorKeychainHelperConstants.protocolVersion,
            ok: false,
            code: "internal_failure"
        ),
        to: FileHandle.standardError
    )
    exit(EXIT_FAILURE)
}
