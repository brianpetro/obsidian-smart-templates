import esbuild from "esbuild";
import process from "process";
import dotenv from "dotenv";
dotenv.config();
import fs from "fs";
import path from "path";

// Compile EJS templates into JSON
const views = {};
fs.readdir("./", (err, files) => {
	if (err) {
		console.error('Error reading the directory', err);
		return;
	}
	files.forEach(file => {
		if(!['.ejs', '.md'].includes(path.extname(file))) return;
		const file_path = path.join("./", file);
		const content = fs.readFileSync(file_path, 'utf8').replace(/\r\n/g, '\n');
		views[path.basename(file, path.extname(file))] = content;
	});
	// console.log('views', views);
	// add dist folder if not exists
	if (!fs.existsSync('dist')) fs.mkdirSync('dist');
	fs.writeFileSync('dist/views.json', JSON.stringify(views, null, 2));
	console.log('EJS templates compiled into templates.json');
});

const banner =
`/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
if you want to view the source, please visit the github repository of this plugin
*/
`;

// get id from manifest.json
const manifest = JSON.parse(fs.readFileSync("./manifest.json", "utf8"));
const plugin_id = manifest.id;

const copy_to_plugins = {
	name: 'copy_to_plugins',
	setup(build) {
		build.onEnd(() => {
			const plugin_path = path.join(process.env.OBSIDIAN_PLUGINS_PATH, plugin_id);
			if (!fs.existsSync(plugin_path)) fs.mkdirSync(plugin_path);
			fs.copyFileSync("./dist/main.js", path.join(plugin_path, "main.js"));
			fs.copyFileSync("./manifest.json", path.join(plugin_path, "manifest.json"));
			fs.copyFileSync("./styles.css", path.join(plugin_path, "styles.css"));
			fs.writeFileSync(path.join(plugin_path, ".hotreload"), ""); // add empty .hotreload file
			console.log("Plugin built and copied to obsidian plugins folder");
		});
	}
};
const context = await esbuild.context({
	banner: {
		js: banner,
	},
	entryPoints: ["main.js"],
	platform: "node",
	bundle: true,
	write: true,
	external: [
		"obsidian",
		"electron",
	],
	format: "cjs",
	target: "es2022",
	logLevel: "info",
	sourcemap: "inline",
	treeShaking: true,
	outfile: "dist/main.js",
	plugins: [
		copy_to_plugins
	]
});
await context.rebuild();
process.exit(0);