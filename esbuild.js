/**
 * @file esbuild.js
 * @description Minimal build script for bundling the Smart Templates Obsidian plugin.
 */

import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import { build_smart_env_config } from 'obsidian-smart-env/build/build_env_config.js';

const roots = [
  path.resolve(process.cwd(), 'src'),
];

const output_dir = path.resolve(process.cwd());
build_smart_env_config(output_dir, roots);

const markdown_plugin = {
  name: 'markdown',
  setup(build) {
    build.onLoad({ filter: /\.md$/ }, async (args) => {
      if (args.with && args.with.type === 'markdown') {
        const text = await fs.promises.readFile(args.path, 'utf8');
        return {
          contents: `export default ${JSON.stringify(text)};`,
          loader: 'js',
        };
      }
    });
  },
};

const dist_dir = path.join(process.cwd(), 'dist');
if (!fs.existsSync(dist_dir)) {
  fs.mkdirSync(dist_dir, { recursive: true });
}

const main_path = path.join(process.cwd(), 'dist', 'main.js');
const manifest_path = path.join(process.cwd(), 'manifest.json');
const styles_path = path.join(process.cwd(), 'styles.css');

const package_json = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
const manifest_json = JSON.parse(fs.readFileSync(manifest_path, 'utf8'));
manifest_json.version = package_json.version;
fs.writeFileSync(manifest_path, JSON.stringify(manifest_json, null, 2));

fs.copyFileSync(manifest_path, path.join(process.cwd(), 'dist', 'manifest.json'));
fs.copyFileSync(styles_path, path.join(process.cwd(), 'dist', 'styles.css'));

const destination_vaults = String(process.env.DESTINATION_VAULTS || '')
  .split(',')
  .map((vault_name) => vault_name.trim())
  .filter(Boolean)
;

const entry_point = 'src/main.js';

esbuild.build({
  entryPoints: [entry_point],
  outfile: 'dist/main.js',
  format: 'cjs',
  bundle: true,
  write: true,
  target: 'es2022',
  logLevel: 'info',
  treeShaking: true,
  platform: 'node',
  preserveSymlinks: true,
  external: [
    'electron',
    'obsidian',
    'crypto',
    '@codemirror/view',
    '@codemirror/state',
    '@huggingface/transformers',
  ],
  plugins: [markdown_plugin],
  loader: {
    '.css': 'text',
  },
}).then(() => {
  console.log('Build complete');

  const release_file_paths = [manifest_path, styles_path, main_path];
  for (const vault_name of destination_vaults) {
    const dest_dir = path.join(
      process.cwd(),
      '..',
      vault_name,
      '.obsidian',
      'plugins',
      'smart-templates',
    );

    fs.mkdirSync(dest_dir, { recursive: true });

    const hotreload_path = path.join(dest_dir, '.hotreload');
    if (!fs.existsSync(hotreload_path)) {
      fs.writeFileSync(hotreload_path, '');
    }

    release_file_paths.forEach((file_path) => {
      fs.copyFileSync(file_path, path.join(dest_dir, path.basename(file_path)));
    });

    console.log(`Copied files to ${dest_dir}`);
  }
}).catch(() => process.exit(1));
