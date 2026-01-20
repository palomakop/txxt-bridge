const axios = require('axios');
const fs = require('fs').promises;
const fsSync = require('fs');
const tmp_dir = require('os').tmpdir();
const path = require('path');
const twilio = require("twilio");
const imgbbUploader = require("imgbb-uploader");

function makeid(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < length) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
      counter += 1;
    }
    return result;
}

function getTodaysDate() {
  return new Date().toISOString().split('T')[0].replace(/-/g, '');
}

exports.handler = async function(context, event, callback) {

  const wfUser = context.WF_USER;
  const wfPass = context.WF_PASS;
  const wfHost = context.WF_HOST;
  const deletePassword = context.DELETE_PASSWORD;

  const accountSid = context.ACCOUNT_SID;
  const authToken = context.AUTH_TOKEN;
  const client = twilio(accountSid, authToken);

  const imgbbKey = context.IMGBB_KEY;

  const todaysDate = getTodaysDate();
  console.log(todaysDate);

  console.log("body: " + event.Body);
  console.log("numMedia: " + event.NumMedia);

  let postItems = [];

  if (event.Body !== "") {
    postItems.push(event.Body);
  }

  const messageSid = event.MessageSid;

  const emoji = ["👾","🥬","❤️‍🔥","🧬","🪲","🌵","🌞","✨","🌈","💥","🪐","🌎","🌱","🍄","🦋","👁️","👽","🖖","🧠","🐸","🍄‍🟫","🐚","🪸","⚡️","☁️","🧊","🎲","⛵️","🏔️","🛖","🕋","💾","📺","📡","💡","💎","⛓️","🔭","🗝️","🪣"];
  const emojo = emoji[Math.floor(Math.random() * emoji.length)];
  const reply = new Twilio.twiml.MessagingResponse();
  reply.message(emojo + " https://txxt.club?t=" + makeid(6));

  try {

    if (event.NumMedia > 0) {

      for (let i = 0; i < event.NumMedia; i++) {
        const mediaUrlKey = "MediaUrl" + i;
        const mediaTypeKey = "MediaContentType" + i;
        const mediaUrl = event[mediaUrlKey];
        const mediaType = event[mediaTypeKey].split("/")[1];
        const mediaSid = mediaUrl.split("/").pop();

        if (["jpeg","png","gif"].includes(mediaType)) {

          const filename = todaysDate + "_" + makeid(10);
          const objectKey = filename + "." + mediaType;
          console.log(objectKey);
          const filepath = path.join(tmp_dir, objectKey);

          const writer = fsSync.createWriteStream(filepath);

          await axios({
            method: 'get',
            url: mediaUrl,
            responseType: 'stream',
            auth: {
              username: accountSid,
              password: authToken
            }
          }).then(response => {

            return new Promise((resolve, reject) => {
              response.data.pipe(writer);
              let error = null;
              writer.on('error', err => {
                error = err;
                writer.close();
                reject(err);
              });
              writer.on('close', () => {
                if (!error) {
                  resolve(true);
                }
              });
            });
          });

          const options = {
            apiKey: imgbbKey,
            name: filename,
            imagePath: filepath,
          };

          let imageUpload = await imgbbUploader(options)
            .catch(function (error) {
              console.error('imgbb upload failed:', error);
              if (error.response) {
                console.log(error.response.data);
                console.log(error.response.status);
                console.log(error.response.headers);
              } else if (error.request) {
                console.log(error.request);
              } else {
                console.log('Error', error.message);
              }
              return null;
            });

          // Check if upload was successful
          if (!imageUpload || !imageUpload.url) {
            console.warn('Image upload failed, skipping this image');
            // Clean up temp file even on failure
            try {
              await fs.unlink(filepath);
            } catch (cleanupError) {
              console.warn('Failed to cleanup temp file:', cleanupError);
            }
            continue; // Skip this image and continue with next
          }

          // Upload successful, now we can add to post and clean up
          const imageMd = "![](" + imageUpload.url + ")";
          postItems.push(imageMd);

          // Delete media from Twilio after successful upload
          try {
            const imageDelete = await client
              .messages(messageSid)
              .media(mediaSid)
              .remove();
            console.log("media deleted from twilio: " + imageDelete);
          } catch (deleteError) {
            console.warn("Failed to delete media from Twilio:", deleteError);
            // Continue anyway - the upload succeeded
          }

          // Clean up temp file
          try {
            await fs.unlink(filepath);
            console.log("Temp file cleaned up: " + filepath);
          } catch (cleanupError) {
            console.warn('Failed to cleanup temp file:', cleanupError);
            // Not critical, continue
          }

        }
      }
    }

    // Post to WriteFreely
    try {
      const wfAuth = await axios.post(wfHost + "/api/auth/login", {
        alias: wfUser,
        pass: wfPass
      });

      const wfToken = "Token " + wfAuth.data.data.access_token;

      const postBody = {
        body: postItems.join("\n\n")
      };

      console.log(JSON.stringify(postBody));

      const wfPost = await axios.post(wfHost + "/api/collections/txxt/posts", postBody, {
        headers: {
          "Authorization": wfToken
        }
      });

      console.log("post response: " + JSON.stringify(wfPost.data));

      // Get post details for notification
      const postSlug = wfPost.data.data.slug;
      const postId = wfPost.data.data.id;
      const postUrl = wfHost + "/" + postSlug;
      const deleteUrl = `https://txxt-delete.val.run/?id=${postId}&password=${deletePassword}`;

      // Send notification to your number
      try {
        await client.messages.create({
          body: `${event.From} posted ${postUrl}\n\ndelete this: ${deleteUrl}`,
          from: '+18888888888', // twilio number
          to: '+18888888888' // notification recipient
        });
        console.log('Notification sent');
      } catch (notifyError) {
        console.warn('Failed to send notification:', notifyError);
        // Don't fail the whole function if notification fails
      }

      const wfLogout = await axios.delete(wfHost + "/api/auth/me", {
        headers: {
          "Authorization": wfToken
        }
      });

      console.log("logout: " + wfLogout.status);

      // Only send success reply if everything worked
      return callback(null, reply);

    } catch (wfError) {
      console.error('WriteFreely error:', wfError);
      
      // Send error message to user
      const errorReply = new Twilio.twiml.MessagingResponse();
      errorReply.message("💀 sorry it's an error");
      return callback(null, errorReply);
    }

  } catch (error) {

    // In the event of an error, return a 500 error and the error message
    console.error(error);

    // Send error message to user for any other errors
    const errorReply = new Twilio.twiml.MessagingResponse();
    errorReply.message("💀 sorry it's an error");
    return callback(null, errorReply);

  }
  
};
