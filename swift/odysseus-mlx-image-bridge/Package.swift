// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "odysseus-mlx-image-bridge",
    platforms: [.macOS(.v26)],
    products: [
        .executable(name: "odysseus-mlx-inpaint", targets: ["UlisesMLXInpaint"]),
        .executable(name: "odysseus-mlx-colorize", targets: ["UlisesMLXColorize"]),
    ],
    dependencies: [
        .package(url: "https://github.com/xocialize/mlx-lama-swift", branch: "main"),
        .package(url: "https://github.com/xocialize/mlx-ddcolor-swift", branch: "main"),
    ],
    targets: [
        .executableTarget(
            name: "UlisesMLXInpaint",
            dependencies: [
                .product(name: "LaMa", package: "mlx-lama-swift"),
                .product(name: "MIGAN", package: "mlx-lama-swift"),
            ]
        ),
        .executableTarget(
            name: "UlisesMLXColorize",
            dependencies: [
                .product(name: "DDColor", package: "mlx-ddcolor-swift"),
            ]
        ),
    ]
)
