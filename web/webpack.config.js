const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: "src/index.html", to: "index.html" },
                { from: "public/", to: "" }
            ],
        }),
    ],
    module: {
        rules: [
          {
            test: /\.worker\.js$/,
            use: { loader: "worker-loader" },
          },
        ],
    },    
};