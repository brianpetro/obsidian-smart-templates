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
// update manifest.json with new version
manifest_json.version = version;
fs.writeFileSync('./manifest.json', JSON.stringify(manifest_json, null, 2));
// commit and push to main
exec('git add .', (add_error) => {
  if (add_error) {
    console.error('Error adding files:', add_error);
    return;
  }
  exec(`git commit -m "Update manifest.json to version ${version}"`, (commit_error) => {
    if (commit_error) {
      console.error('Error committing files:', commit_error);
      return;
    }
    exec('git push origin main', (push_error) => {
      if (push_error) {
        console.error('Error pushing to main:', push_error);
        return;
      }
      console.log('Successfully pushed to main.');
    });
  });
});

// Create readline interface
const rl_interface = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl_interface.question(`Confirm release version (${version}): `, (confirmed_version) => {
  if (!confirmed_version) confirmed_version = version;
  const release_name = confirmed_version;
  console.log(`Creating release for version ${confirmed_version}`);
  rl_interface.question('Enter release description: ', async (release_description) => {
    rl_interface.close();

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
      return;
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

      const upload_asset = async (asset_path, asset_name) => {
        const upload_url = `${release_info.upload_url.split('{')[0]}?name=${encodeURIComponent(asset_name)}`;
        console.log(`Uploading ${asset_name} to ${upload_url}`); // Debug log

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

          console.log(`File upload response for ${asset_name}:`, response.data); // Debug log
        } catch (error) {
          console.error(`Error uploading file ${asset_name}:`, error);
        }
      };

      const upload_asset_curl = (asset_path, asset_name) => {
        const upload_url = `${release_info.upload_url.split('{')[0]}?name=${encodeURIComponent(asset_name)}`;
        const mime_type = 'application/octet-stream'; // You can also use a library to determine the MIME type based on the file extension

        const command = `curl -X POST -H "Authorization: Bearer ${github_token}" -H "Content-Type: ${mime_type}" --data-binary @${asset_path} "${upload_url}"`;

        exec(command, (error, stdout, stderr) => {
          if (error) {
            console.error(`Error uploading file ${asset_name}:`, error);
            return;
          }
          console.log(`Uploaded file: ${asset_name}`);
          console.log(stdout);
        });
      };

      // Create a zip file of dist folder
      const zip_name = `${manifest_id}-${confirmed_version}.zip`;
      const output = fs.createWriteStream(`./${zip_name}`);
      const archive = archiver('zip', { zlib: { level: 0 } });

      archive.on('error', function(err) {
        throw err;
      });

      archive.on('end', async function() {
        console.log('Archive wrote %d bytes', archive.pointer());

        // Upload zip file after archive has been finalized
        upload_asset_curl(`./${zip_name}`, zip_name);
        console.log('Zip file uploaded.');

        // Upload each file in dist folder
        const files = fs.readdirSync('./dist');
        for (const file of files) {
          await upload_asset(`./dist/${file}`, file);
          console.log(`Uploaded file: ${file}`);
        }

        // Remove zip file
        fs.unlinkSync(`./${zip_name}`);

        console.log('All files uploaded.');
      });

      archive.pipe(output);
      archive.directory('dist/', false);
      await archive.finalize();

    } catch (error) {
      console.error('Error in release process:', error);
    }
  });
});
