#!/usr/bin/env node
/**
 * Registers GoogleService-Info.plist as a bundle resource in the iOS Xcode
 * project. Idempotent — safe to re-run.
 *
 * One-off: run once after `npx cap add ios` until the plist is present in
 * the App target's Resources build phase. The `xcode` npm package's
 * `addResourceFile` helper assumes a flat "Resources" group that Capacitor
 * projects don't have, so this script calls the lower-level primitives
 * directly with the App group as the container.
 *
 * Usage: node scripts/add-googleservice-plist.js
 */

const fs = require('fs');
const path = require('path');
const xcode = require('xcode');

const PROJECT_PATH = path.resolve(
  __dirname,
  '../ios/App/App.xcodeproj/project.pbxproj',
);
const PLIST_NAME = 'GoogleService-Info.plist';
const GROUP_NAME = 'App';
const TARGET_NAME = 'App';

if (!fs.existsSync(PROJECT_PATH)) {
  console.error(`pbxproj not found at ${PROJECT_PATH}`);
  process.exit(1);
}

const project = xcode.project(PROJECT_PATH);
project.parseSync();

const fileRefs = project.hash.project.objects.PBXFileReference || {};
const alreadyRegistered = Object.values(fileRefs).some(
  (ref) => ref && ref.path && ref.path.replace(/"/g, '') === PLIST_NAME,
);
if (alreadyRegistered) {
  console.log(`✓ ${PLIST_NAME} already registered in pbxproj — skipping.`);
  process.exit(0);
}

const target = project.pbxTargetByName(TARGET_NAME);
if (!target) {
  console.error(`Target "${TARGET_NAME}" not found.`);
  process.exit(1);
}

// Capacitor's "App" group is identified by path, not name.
const groupKey =
  project.findPBXGroupKey({ name: GROUP_NAME }) ||
  project.findPBXGroupKey({ path: GROUP_NAME });
if (!groupKey) {
  console.error(`Group "${GROUP_NAME}" not found.`);
  process.exit(1);
}

const PbxFile = require('xcode/lib/pbxFile');
const file = new PbxFile(PLIST_NAME, {
  lastKnownFileType: 'text.plist.xml',
});
file.uuid = project.generateUuid();
file.fileRef = project.generateUuid();
file.target = target.uuid;

project.addToPbxBuildFileSection(file);
project.addToPbxFileReferenceSection(file);
project.addToPbxResourcesBuildPhase(file);
project.addToPbxGroup(file, groupKey);

fs.writeFileSync(PROJECT_PATH, project.writeSync());
console.log(`✓ registered ${PLIST_NAME} as a resource in the "${TARGET_NAME}" target.`);
