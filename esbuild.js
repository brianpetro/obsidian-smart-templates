import esbuild from 'esbuild';
import path from 'path';
import 'dotenv/config';
import { build_plugin } from 'obsidian-smart-env/build/build_plugin.js';
import { build_smart_env_config } from 'obsidian-smart-env/build/build_env_config.js';

const roots = [
  path.resolve(process.cwd(), 'src'),
];

build_plugin({
  esbuild,
  env_config_builder: build_smart_env_config,
  env_config_output_dir: process.cwd(),
  env_config_roots: roots,
  external: [
    '@codemirror/view',
    '@codemirror/state',
    '@huggingface/transformers',
  ],
  plugin_id: 'smart-templates',
}).catch((err) => {
  console.error('Error in build process:', err);
  process.exit(1);
});
