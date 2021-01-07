const core = require('@actions/core');
const { exec } = require('child_process');
const { Octokit } = require('@octokit/rest');
const fs = require('fs');

const OWNER = process.env.GITHUB_REPOSITORY.split('/')[0];
const REPOSITORY = process.env.GITHUB_REPOSITORY.split('/')[1];

async function getLatestRelease() {
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });

  try {
    let latestRelease = await octokit.repos.getLatestRelease({
      owner: OWNER,
      repo: REPOSITORY,
    });

    let body = latestRelease.data.body;
    let tag = latestRelease.data.tag_name;

    body = body.replace('#', '##');
    body = `# ${REPOSITORY} ${tag}\n` + body;

    return {
      tag: latestRelease.data.tag_name,
      body,
    }
  } catch (e) {
    console.log(e);
  }
}


async function getJsonModule() {
  const moduleText = fs.readFileSync('module.json', { encoding: 'utf-8' });
  const moduleJson = JSON.parse(moduleText);

  return moduleJson;
}

async function writeModuleFile(newJsonModule) {
  fs.writeFileSync('module.json', JSON.stringify(newJsonModule, null, 2));
}

// most @actions toolkit packages have async methods
async function run() {
  try {
    // Get latest tag version and body
    const latestRelease = await getLatestRelease();
    core.info(`Repo ${REPOSITORY}: ${latestRelease.tag}`);
    core.info(`------ Description -------`);
    core.info(latestRelease.body);
    core.info(`--------------------------`);

    // Update version in polaris-centre
    const moduleJson = await getJsonModule();
    moduleJson[REPOSITORY] = latestRelease.tag;
    writeModuleFile(moduleJson);

    // Update PreRelease
    fs.appendFileSync('docs/PreRelease.md', latestRelease.body);

    // Push changed to center repo
    exec(`git config --local user.email "bot.noreply@verichains.io";git config --local user.name "[bot]";git add .; git commit -m "bump ${REPOSITORY} to ${latestRelease.tag}"`, (error, stdout, stderr) => {
      if (error) {
        core.setFailed(`Error when commit: ${error.message}`);
        return;
      }

      core.info(`Commit result: ${stdout}|${stderr}`);
      let remoteRepo = `https://${process.env.GITHUB_ACTOR}:${process.env.CENTER_GITHUB_TOKEN}@github.com/${process.env.CENTER_REPOSITORY}.git`;
      exec(`git push ${remoteRepo}`, (error, stdout, stderr) => {
        if (error) {
          core.setFailed(`Error when push: ${error.message}`);
          return;
        }

        core.info(`Push result: ${stdout}|${stderr}`);
        core.info(`---------- Success ---------`);
      });
    });
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
