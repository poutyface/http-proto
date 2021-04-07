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
    resolve: {
        modules: [path.resolve(__dirname, 'src'), 'node_modules'],
        alias: {
        }
    },
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
                    ['@babel/preset-env',
                    {
                        "useBuiltIns": "usage",
                        "corejs": { "version": 3, "proposals": false }
                    }],
                    '@babel/preset-react',
                ],
            },
          },
        ],
    },    
};