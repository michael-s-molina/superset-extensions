const path = require("path");
const webpack = require("webpack");
const { ModuleFederationPlugin } = require("webpack").container;
const packageConfig = require("./package");
const extensionConfig = require("../extension.json");

module.exports = (env, argv) => {
  const isProd = argv.mode === "production";

  return {
    entry: isProd ? {} : "./src/index.tsx",
    mode: isProd ? "production" : "development",
    experiments: {
      asyncWebAssembly: true,
    },
    devServer: {
      port: 3000,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    },
    output: {
      clean: true,
      filename: isProd ? undefined : "[name].[contenthash].js",
      chunkFilename: "[name].[contenthash].js",
      path: path.resolve(__dirname, "dist"),
      publicPath: `/api/v1/extensions/${extensionConfig.publisher}/${extensionConfig.name}/`,
    },
    resolve: {
      extensions: [".ts", ".tsx", ".js", ".jsx"],
      // Stub Node.js built-ins that polyglot-sql/sdk references in its
      // Node.js code paths but are not needed in browser/bundler builds.
      fallback: {
        fs: false,
        url: false,
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
      // Strip the "node:" URI prefix so resolve.fallback can stub Node.js
      // built-ins referenced by @polyglot-sql/sdk's Node.js code paths.
      new webpack.NormalModuleReplacementPlugin(
        /^node:/,
        (resource) => { resource.request = resource.request.replace(/^node:/, ""); },
      ),
      new ModuleFederationPlugin({
        name: "michaelSMolina_queryStatements",
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
          antd: {
            singleton: true,
            requiredVersion: packageConfig.peerDependencies["antd"],
            import: false,
          },
        },
      }),
    ],
  };
};
