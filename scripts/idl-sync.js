#!/usr/bin/env node
/**
 * IDL Sync Script
 * 
 * Copies the generated IDL from the Anchor program to the SDK and app packages.
 * Run after `anchor build` to ensure SDK and app have the latest IDL.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const IDL_SOURCE = path.join(ROOT_DIR, 'programs', 'l2conceptv1', 'target', 'idl', 'l2conceptv1.json');
const SDK_IDL_DIR = path.join(ROOT_DIR, 'packages', 'sdk', 'idl');
const APP_IDL_DIR = path.join(ROOT_DIR, 'app', 'src', 'idl');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
}

function copyIdl(source, dest) {
  if (!fs.existsSync(source)) {
    console.error(`IDL not found at ${source}`);
    console.error('Make sure to run `anchor build` first.');
    process.exit(1);
  }

  ensureDir(path.dirname(dest));
  fs.copyFileSync(source, dest);
  console.log(`Copied IDL to ${dest}`);
}

function main() {
  console.log('Syncing IDL...');
  
  try {
    // Copy to SDK
    copyIdl(IDL_SOURCE, path.join(SDK_IDL_DIR, 'l2conceptv1.json'));
    
    // Copy to App
    copyIdl(IDL_SOURCE, path.join(APP_IDL_DIR, 'l2conceptv1.json'));
    
    console.log('IDL sync complete!');
  } catch (error) {
    console.error('Error syncing IDL:', error.message);
    process.exit(1);
  }
}

main();
