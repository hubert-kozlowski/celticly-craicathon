const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

/** @type {import('webpack').Configuration} */
module.exports = {
  entry: {
    "service-worker": "./src/background/service-worker.ts",
    "content-script": "./src/content/content-script.ts",
    "popup": "./src/popup/popup.ts",
    "options": "./src/options/options.ts",
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        // Icons into dist/icons/ (already present, keep for asset resolution)
        { from: "icons", to: path.resolve(__dirname, "dist/icons") },
        // Copy manifest.json into dist/, rewriting "dist/foo.js" → "foo.js"
        {
          from: "manifest.json",
          to: path.resolve(__dirname, "dist/manifest.json"),
          transform(content) {
            return content.toString().replace(/"dist\//g, '"');
          },
        },
        // Copy popup.html into dist/, rewriting src="dist/popup.js" → src="popup.js"
        {
          from: "popup.html",
          to: path.resolve(__dirname, "dist/popup.html"),
          transform(content) {
            return content.toString().replace(/src="dist\//g, 'src="');
          },
        },
        // Copy options.html into dist/, rewriting src="dist/options.js" → src="options.js"
        {
          from: "options.html",
          to: path.resolve(__dirname, "dist/options.html"),
          transform(content) {
            return content.toString().replace(/src="dist\//g, 'src="');
          },
        },
      ],
    }),
  ],
  // Service workers must not use eval; use cheap-source-map instead
  devtool: "cheap-source-map",
};
