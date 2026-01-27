const path = require("path");
const { ModuleFederationPlugin } = require("webpack").container;
const packageConfig = require("./package.json");

module.exports = (env, argv) => {
  const isProd = argv.mode === "production";

  return {
    entry: isProd ? {} : "./src/index.tsx",
    mode: isProd ? "production" : "development",
    devServer: {
      port: 3001,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    },
    output: {
      filename: isProd ? undefined : "[name].[contenthash].js",
      chunkFilename: "[name].[contenthash].js",
      clean: true,
      path: path.resolve(__dirname, "dist"),
      publicPath: `/api/v1/extensions/${packageConfig.name}/`,
    },
    resolve: {
      extensions: [".ts", ".tsx", ".js", ".jsx"],
      symlinks: true,
      alias: {
        "@apache-superset/core": path.resolve(__dirname, "../../../superset/superset-frontend/packages/superset-core"),
      },
    },
    externalsType: "window",
    externals: {
      "@apache-superset/core": "superset",
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ["style-loader", "css-loader"],
        },
      ],
    },
    plugins: [
      new ModuleFederationPlugin({
        name: packageConfig.name,
        filename: "remoteEntry.[contenthash].js",
        exposes: {
          "./index": "./src/index.tsx",
        },
        shared: {
          react: {
            singleton: true,
            requiredVersion: packageConfig.peerDependencies.react,
            import: false,
          },
          "react-dom": {
            singleton: true,
            requiredVersion: packageConfig.peerDependencies["react-dom"],
            import: false,
          },
        },
      }),
    ],
  };
};
