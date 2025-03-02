const axios = require('axios');
const fs = require('fs');
const tmp_dir = require('os').tmpdir();
const path = require('path');
const strftime = require('strftime');
const imgbbUploader = require("imgbb-uploader");
const twilio = require("twilio");

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

exports.handler = async function(context, event, callback) {

  const wfUser = context.WF_USER;
  const wfPass = context.WF_PASS;
  const wfHost = context.WF_HOST;

  const blogUrl = context.BLOG_URL;

  const accountSid = context.ACCOUNT_SID;
  const authToken = context.AUTH_TOKEN;
  const client = twilio(accountSid, authToken);

  const imgbbKey = context.IMGBB_KEY;

  const todaysDate = strftime('%Y%m%d');
  console.log(todaysDate);

  console.log("body: " + event.Body);
  console.log("numMedia: " + event.NumMedia);

  let postItems = [];

  if (event.Body != "") {
    postItems.push(event.Body);
  }

  const messageSid = event.MessageSid;

  const emoji = ["👾","🥬","❤️‍🔥","🧬","🪲","🌵","🌞","✨","🌈","💥","🪐","🌎","🌱","🍄","🦋","👁️","👽","🖖","🧠","🐸","🍄‍🟫","🐚","🪸","⚡️","☁️","🧊","🎲","⛵️","🏔️","🛖","🕋","💾","📺","📡","💡","💎","⛓️","🔭","🗝️","🪣"];
  let emojo = emoji[Math.floor(Math.random()*emoji.length)];
  let reply = new Twilio.twiml.MessagingResponse();
  reply.message(emojo + " " + blogUrl);

  try {

    if (event.NumMedia > 0) {

      for (let i = 0; i < event.NumMedia; i++) {
        let mediaUrlKey = "MediaUrl" + i;
        let mediaTypeKey = "MediaContentType" + i;
        mediaUrl = event[mediaUrlKey];
        mediaType = event[mediaTypeKey].split("/")[1];
        mediaSid = mediaUrl.split("/").pop();

        if (["jpeg","png","gif"].includes(mediaType)) {

          let filename = todaysDate + "_" + makeid(10);
          let objectKey = filename + "." + mediaType;
          console.log(objectKey);
          let filepath = path.join(tmp_dir, objectKey);

          let writer = fs.createWriteStream(filepath);

          let imageRequest = await axios({
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

          // read the contents of the temporary directory to check that the file was created
          fs.readdir(tmp_dir, function(err, files) {
            if (err) callback(err);
            console.log("File created in temporary directory: " + files.join(", "));
          });

          let imageDelete = await client
            .messages(messageSid)
            .media(mediaSid)
            .remove();

          console.log("media deleted from twilio: " + imageDelete);

          imgbbHost = "https://api.imgbb.com/1/upload?key=" + imgbbKey + "&image=" + imageRequest.data;

          let options = {
            apiKey: imgbbKey, // MANDATORY
            name: filename,
            imagePath: filepath,
            // base64string: base64Encode(imageRequest.data)
          };

          let imageUpload = await imgbbUploader(options)
            .catch(function (error) {
              if (error.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                console.log(error.response.data);
                console.log(error.response.status);
                console.log(error.response.headers);
              } else if (error.request) {
                // The request was made but no response was received
                // `error.request` is an instance of XMLHttpRequest in the browser 
                // and an instance of http.ClientRequest in node.js
                console.log(error.request);
              } else {
                // Something happened in setting up the request that triggered an Error
                console.log('Error', error.message);
              }
            });

            // console.log(imageUpload);

            imageMd = "![](" + imageUpload.url + ")";

            postItems.push(imageMd);

        }
      }
    }

    // post to writeFreely

    const wfAuth = await axios.post(wfHost + "/auth/login", {
      alias: wfUser,
      pass: wfPass
    });

    // console.log("auth: " + JSON.stringify(wfAuth.data));

    const wfToken = "Token " + wfAuth.data.data.access_token;

    const postBody = {
      body: postItems.join("\n\n")
    }

    console.log(JSON.stringify(postBody));

    const wfPost = await axios.post(wfHost + "/collections/txxt/posts", postBody, {
      headers: {
        "Authorization": wfToken
      }
    });

    console.log("post response: " + wfPost.data);

    const wfLogout = await axios.delete(wfHost + "/auth/me", {
      headers: {
        "Authorization": wfToken
      }
    });

    console.log("logout: " + wfLogout.status);

    return callback(null, reply);

  } catch (error) {

    // In the event of an error, return a 500 error and the error message

    console.error(error);

    return callback(error, "If at first you don't succeed, try, try again.");

  }
  
}