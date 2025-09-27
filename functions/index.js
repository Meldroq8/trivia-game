const functions = require('firebase-functions');
const { Octokit } = require('@octokit/rest');

// GitHub configuration
const GITHUB_TOKEN = functions.config().github.token; // Set via: firebase functions:config:set github.token="your_token"
const GITHUB_OWNER = 'Meldroq8';
const GITHUB_REPO = 'trivia-game';

const octokit = new Octokit({
  auth: GITHUB_TOKEN,
});

// Trigger deployment when images are uploaded to Firebase Storage
exports.onImageUpload = functions.storage.object().onFinalize(async (object) => {
  const filePath = object.name;

  // Only trigger for category or question images
  if (filePath.startsWith('categories/') || filePath.startsWith('questions/')) {
    console.log(`🖼️ New image uploaded: ${filePath}`);

    try {
      // Trigger GitHub Actions workflow
      await octokit.rest.actions.createWorkflowDispatch({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        workflow_id: 'simple-deploy.yml', // Your workflow file name
        ref: 'main',
        inputs: {
          reason: `Auto-deploy for new image: ${filePath}`
        }
      });

      console.log('✅ GitHub Actions deployment triggered successfully');
    } catch (error) {
      console.error('❌ Failed to trigger deployment:', error);
    }
  }
});