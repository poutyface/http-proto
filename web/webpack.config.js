const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
    mode: 'development',
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
            include: [path.resolve(__dirname, 'src')],
            use: { loader: "worker-loader" },
          },
          {
            test: /\.js[x]?$/,
            exclude: /node_modules/,
            loader: 'babel-loader',
            options: {
                presets: [
                    '@babel/preset-env',
                    '@babel/preset-react',
                ],
            },
          },
        ],
    },    
};