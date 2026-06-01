#!/usr/bin/env node
import Ajv2020 from 'ajv/dist/2020.js';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

const ROOT = process.cwd();
const CONTRACT_DIR = join(ROOT, 'governance', 'contracts');
const SCHEMA_DIR = join(ROOT, 'governance', 'schemas');

const contractSchema = JSON.parse(readFileSync(join(SCHEMA_DIR, 'contract.schema.json'), 'utf8'));
const registrySchema = JSON.parse(readFileSync(join(SCHEMA_DIR, 'registry.schema.json'), 'utf8'));

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateContract = ajv.compile(contractSchema);
const validateRegistry = ajv.compile(registrySchema);

const contractFiles = readdirSync(CONTRACT_DIR)
  .filter((name) => name.endsWith('.json'))
  .sort();

const errors = [];
const contracts = new Map();
let registry = null;

function readJson(file) {
  try {
    return JSON.parse(readFileSync(join(CONTRACT_DIR, file), 'utf8'));
  } catch (err) {
    errors.push(`${file}: invalid JSON: ${err.message}`);
    return null;
  }
}

function formatAjvErrors(file, result) {
  return (result.errors ?? []).map((err) => {
    const path = err.instancePath || '/';
    return `${file}${path}: ${err.message}`;
  });
}

for (const file of contractFiles) {
  const data = readJson(file);
  if (!data) continue;

  if (file === 'registry.json') {
    registry = data;
    if (!validateRegistry(data)) errors.push(...formatAjvErrors(file, validateRegistry));
    continue;
  }

  if (!validateContract(data)) errors.push(...formatAjvErrors(file, validateContract));

  const expectedId = basename(file, '.json');
  if (data.id !== expectedId) {
    errors.push(`${file}: id "${data.id}" must match filename "${expectedId}"`);
  }
  contracts.set(data.id, data);
}

if (!registry) {
  errors.push('registry.json: missing registry file');
} else {
  const seen = new Set();
  for (const category of registry.categories ?? []) {
    for (const entry of category.contracts ?? []) {
      if (seen.has(entry.id)) errors.push(`registry.json: duplicate contract id "${entry.id}"`);
      seen.add(entry.id);
      if (entry.id === 'dependencies') continue;
      if (!contracts.has(entry.id)) {
        errors.push(`registry.json: references missing governance/contracts/${entry.id}.json`);
      }
    }
  }
  for (const id of contracts.keys()) {
    if (!seen.has(id)) errors.push(`registry.json: missing contract "${id}"`);
  }
}

if (!existsSync(join(ROOT, 'governance', 'allowed-deps.json'))) {
  errors.push('governance/allowed-deps.json: missing dependencies allowlist');
}

if (errors.length) {
  console.error(`BLOCKED: ${errors.length} governance contract issue(s):`);
  for (const err of errors) console.error(`- ${err}`);
  process.exit(1);
}

console.log(`OK: ${contracts.size} governance contracts + registry validate.`);
