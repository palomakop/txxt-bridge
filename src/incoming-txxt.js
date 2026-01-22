const axios = require('axios');
const fs = require('fs').promises;
const fsSync = require('fs');
const tmp_dir = require('os').tmpdir();
const path = require('path');
const twilio = require("twilio");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

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
  const listValUrl = context.LIST_VAL_URL;
  const deleteValUrl = context.DELETE_VAL_URL;
  const twilioPhoneNumber = context.TWILIO_PHONE_NUMBER;
  const moderatorPhoneNumber = context.MODERATOR_PHONE_NUMBER;

  const accountSid = context.ACCOUNT_SID;
  const authToken = context.AUTH_TOKEN;
  const client = twilio(accountSid, authToken);

  const s3Bucket = context.S3_BUCKET_NAME;
  const s3Region = context.S3_REGION;
  const awsAccessKeyId = context.AWS_ACCESS_KEY_ID;
  const awsSecretAccessKey = context.AWS_SECRET_ACCESS_KEY;

  const s3Client = new S3Client({
    region: s3Region,
    credentials: {
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey
    }
  });

  const todaysDate = getTodaysDate();
  console.log(todaysDate);

  const messageText = event.Body.trim().toLowerCase();
  console.log("body: " + event.Body);
  console.log("numMedia: " + event.NumMedia);

  // List of reserved commands that should not be posted to blog
  const reservedCommands = [
    'subscribe', 
    'unsubscribe', 
    'cancel', 
    'end', 
    'optout', 
    'quit', 
    'revoke', 
    'stop', 
    'stopal', 
    'info', 
    'help'
  ];

  // Check if message is a reserved command (case insensitive)
  if (reservedCommands.includes(messageText)) {
    console.log('Reserved command detected:', messageText);
    
    // Only handle subscribe/unsubscribe via val.town
    if (messageText === 'subscribe' || messageText === 'unsubscribe') {
      try {
        // Forward to val.town for list management
        const valResponse = await axios.post(listValUrl, new URLSearchParams({
          From: event.From,
          Body: event.Body
        }), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        
        // Val returns TwiML, parse and send back
        const valTwiml = valResponse.data;
        return callback(null, valTwiml);
        
      } catch (valError) {
        console.error('Val.town error:', valError);
        const errorReply = new Twilio.twiml.MessagingResponse();
        errorReply.message("💀 sorry it's an error");
        return callback(null, errorReply);
      }
    } else {
      // For other reserved commands, let Twilio handle them natively
      // Just return empty response
      return callback(null, new Twilio.twiml.MessagingResponse());
    }
  }

  // Continue with normal blog posting for non-reserved messages
  let postItems = [];

  if (event.Body !== "") {
    postItems.push(event.Body);
  }

  const messageSid = event.MessageSid;

  const emoji = ["👾","🥬","❤️‍🔥","🧬","🪲","🌵","🌞","✨","🌈","💥","🪐","🌎","🌱","🍄","🦋","👁️","👽","🖖","🧠","🐸","🍄‍🟫","🐚","🪸","⚡️","☁️","🧊","🎲","⛵️","🏔️","🛖","🕋","💾","📺","📡","💡","💎","⛓️","🔭","🗝️","🪣"];
  const emojo = emoji[Math.floor(Math.random() * emoji.length)];

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

          // Upload to S3
          let imageUrl = null;
          try {
            const fileBuffer = await fs.readFile(filepath);

            const uploadParams = {
              Bucket: s3Bucket,
              Key: objectKey,
              Body: fileBuffer,
              ContentType: `image/${mediaType}`
            };

            const command = new PutObjectCommand(uploadParams);
            await s3Client.send(command);

            // Construct the public URL
            imageUrl = `https://${s3Bucket}.s3.${s3Region}.amazonaws.com/${objectKey}`;
            console.log('S3 upload successful:', imageUrl);

          } catch (error) {
            console.error('S3 upload failed:', error);
            if (error.$metadata) {
              console.log('Error metadata:', error.$metadata);
            }
            // Clean up temp file even on failure
            try {
              await fs.unlink(filepath);
            } catch (cleanupError) {
              console.warn('Failed to cleanup temp file:', cleanupError);
            }
            continue; // Skip this image and continue with next
          }

          // Check if upload was successful
          if (!imageUrl) {
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
          const imageMd = "![](" + imageUrl + ")";
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
      const deleteUrl = `${deleteValUrl}?id=${postId}&password=${deletePassword}`;

      // Send notification to moderator
      try {
        await client.messages.create({
          body: `${event.From} posted ${postUrl}\n\ndelete this: ${deleteUrl}`,
          from: twilioPhoneNumber,
          to: moderatorPhoneNumber
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

      // Check if user is subscribed for customized reply
      let isSubscribed = false;
      try {
        const checkSubResponse = await axios.get(listValUrl + '/check?phone=' + encodeURIComponent(event.From));
        isSubscribed = checkSubResponse.data.subscribed;
      } catch (checkError) {
        console.warn('Failed to check subscription status:', checkError);
      }

      // Send customized success reply
      const reply = new Twilio.twiml.MessagingResponse();
      if (isSubscribed) {
        reply.message(emojo + " " + wfHost + "?t=" + makeid(6) + "\n\nyou are subscribed to the weekly digest");
      } else {
        reply.message(emojo + " " + wfHost + "?t=" + makeid(6) + "\n\ntext SUBSCRIBE for a weekly digest");
      }

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
