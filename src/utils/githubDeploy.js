/**
 * Utility to trigger GitHub Actions deployment from admin panel
 */

const GITHUB_TOKEN = import.meta.env.VITE_GITHUB_TOKEN; // Set in .env
const GITHUB_OWNER = 'Meldroq8';
const GITHUB_REPO = 'trivia-game';

export const triggerDeployment = async (reason = 'Manual deployment from admin panel') => {
  if (!GITHUB_TOKEN) {
    throw new Error('GitHub token not configured');
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/simple-deploy.yml/dispatches`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          reason: reason
        }
      })
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return { success: true, message: 'Deployment triggered successfully' };
  } catch (error) {
    console.error('Failed to trigger deployment:', error);
    throw error;
  }
};