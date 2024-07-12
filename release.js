import dotenv from 'dotenv';
import fs from 'fs';
import readline from 'readline';
import archiver from 'archiver';
import axios from 'axios';
import { exec } from 'child_process';

dotenv.config();

// Read package.json and manifest.json
const package_json = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const manifest_json = JSON.parse(fs.readFileSync('./manifest.json', 'utf8'));
const version = package_json.version;
const manifest_id = manifest_json.id;

// Function to update manifest and push changes
async function update_manifest_and_push() {
    // Update manifest.json with new version
    manifest_json.version = version;
    fs.writeFileSync('./manifest.json', JSON.stringify(manifest_json, null, 2));

    // Commit and push to main
    try {
        await exec_command('git add .');
        await exec_command(`git commit -m "Update manifest.json to version ${version}"`);
        await exec_command('git push origin main');
        console.log('Successfully pushed to main.');
    } catch (error) {
        console.error('Error in git operations:', error);
        process.exit(1);
    }
}

// Function to execute shell commands
function exec_command(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                resolve(stdout);
            }
        });
    });
}

// Function to create a release
async function create_release(confirmed_version, release_description) {
    const release_name = confirmed_version;
    console.log(`Creating release for version ${confirmed_version}`);

    // Prepare release data
    const release_data = {
        tag_name: `${confirmed_version}`,
        name: release_name,
        body: release_description,
        draft: false,
        prerelease: false
    };

    // Environment variables
    const github_token = process.env.GH_TOKEN;
    const github_repo = process.env.GH_REPO;

    if (!github_token || !github_repo) {
        console.error('Error: GitHub token or repository not set in .env file.');
        process.exit(1);
    }

    try {
        // Create GitHub release
        const release_response = await axios.post(`https://api.github.com/repos/${github_repo}/releases`, release_data, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${github_token}`
            }
        });

        const release_info = release_response.data;
        console.log('Release created:', release_info);

        await upload_assets(release_info, github_token);

    } catch (error) {
        console.error('Error in release process:', error);
        process.exit(1);
    }
}

// Function to upload assets
async function upload_assets(release_info, github_token) {
    const upload_asset = async (asset_path, asset_name) => {
        const upload_url = `${release_info.upload_url.split('{')[0]}?name=${encodeURIComponent(asset_name)}`;
        console.log(`Uploading ${asset_name} to ${upload_url}`);

        try {
            const stats = fs.statSync(asset_path);
            const content_length = stats.size;

            const response = await axios.post(upload_url, fs.createReadStream(asset_path), {
                headers: {
                    'Authorization': `Bearer ${github_token}`,
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': content_length
                }
            });

            console.log(`File upload response for ${asset_name}:`, response.data);
        } catch (error) {
            console.error(`Error uploading file ${asset_name}:`, error);
        }
    };

    // Create a zip file of dist folder
    const zip_name = `${manifest_id}-${version}.zip`;
    const output = fs.createWriteStream(`./${zip_name}`);
    const archive = archiver('zip', { zlib: { level: 0 } });

    archive.on('error', function(err) {
        throw err;
    });

    archive.on('end', async function() {
        console.log('Archive wrote %d bytes', archive.pointer());

        // Upload zip file
        await upload_asset(`./${zip_name}`, zip_name);
        console.log('Zip file uploaded.');

        // Upload each file in dist folder
        // const files = fs.readdirSync('./dist');
        // for (const file of files) {
        //     await upload_asset(`./dist/${file}`, file);
        //     console.log(`Uploaded file: ${file}`);
        // }
        await upload_asset('./dist/main.js', 'main.js');
        console.log('Uploaded file: main.js');

        // Upload manifest.json and styles.css
        await upload_asset('./manifest.json', 'manifest.json');
        await upload_asset('./styles.css', 'styles.css');
        console.log('Uploaded files: manifest.json, styles.css');

        // Remove zip file
        fs.unlinkSync(`./${zip_name}`);

        console.log('All files uploaded.');
    });

    archive.pipe(output);
    archive.directory('dist/', false);
    archive.file('manifest.json', { name: 'manifest.json' });
    archive.file('styles.css', { name: 'styles.css' });
    await archive.finalize();
}

// Main execution
async function main() {
    await update_manifest_and_push();

    const rl_interface = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const confirmed_version = await new Promise(resolve => {
        rl_interface.question(`Confirm release version (${version}): `, answer => {
            resolve(answer || version);
        });
    });

    const release_description = await new Promise(resolve => {
        rl_interface.question('Enter release description: ', resolve);
    });

    rl_interface.close();

    await create_release(confirmed_version, release_description);
}

main().catch(error => {
    console.error('An error occurred:', error);
    process.exit(1);
});
