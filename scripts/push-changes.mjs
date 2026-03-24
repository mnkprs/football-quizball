import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function pushChanges() {
  try {
    console.log('[v0] Checking git status...');
    const { stdout: status } = await execAsync('git status --short');
    console.log('[v0] Modified files:', status);

    console.log('[v0] Adding all changes...');
    await execAsync('git add .');

    console.log('[v0] Committing changes...');
    await execAsync('git commit -m "Rebuild leaderboard screen with DESIGN.md system"');

    console.log('[v0] Pushing to leaderboards-screen-redesign branch...');
    await execAsync('git push origin leaderboards-screen-redesign');

    console.log('[v0] ✅ Changes pushed successfully!');
  } catch (error) {
    console.error('[v0] Error:', error.message);
  }
}

pushChanges();
