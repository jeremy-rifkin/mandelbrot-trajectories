const path = require("path");

module.exports = {
	entry: "./gui/main.tsx",
	//mode: 'development',
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				use: "ts-loader",
				exclude: path.resolve(__dirname, "node_modules"),
			},
			{
				test: /\.s[ac]ss$/i,
				use: ["style-loader", "css-loader", "sass-loader"],
			}
		],
	},
	resolve: {
		extensions: [".tsx", ".ts", ".js"],
	},
	output: {
		filename: "main.js",
		path: path.resolve(__dirname, "gui-dist"),
	},
};
