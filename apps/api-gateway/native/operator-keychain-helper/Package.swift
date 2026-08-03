// swift-tools-version: 5.4
import PackageDescription

let package = Package(
    name: "OperatorKeychainHelper",
    platforms: [.macOS(.v11)],
    products: [
        .executable(
            name: "operator-keychain-helper",
            targets: ["OperatorKeychainHelper"]
        )
    ],
    targets: [
        .target(name: "OperatorKeychainHelperCore"),
        .executableTarget(
            name: "OperatorKeychainHelper",
            dependencies: ["OperatorKeychainHelperCore"]
        ),
        .testTarget(
            name: "OperatorKeychainHelperCoreTests",
            dependencies: ["OperatorKeychainHelperCore"]
        )
    ]
)
