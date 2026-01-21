# txxt-bridge

This is a node.js serverless function for the Twilio platform. It allows you to post to a WriteFreely blog by sending an SMS with text and/or images to a Twilio phone number. There is no authentication, so only share your Twilio phone number with people you want to give posting access to.

I created this project as a fun thing for me and my friends. It is based on the idea (but not the code) of [snacksnacksnacksnacksnack](https://github.com/samn/snacks). (Except that project uses an email address, not a phone number, and doesn't support text, only images.) It also bears some similarity to the earliest version of Twitter.

Our WriteFreely blog has custom css that hides most of the UI elements, creating a relatively context-free stream of posts. You can visit it at [txxt.club](https://txxt.club).

If you want to create your own SMS-powered microblog, read on below.

## Requirements
- You will need an account on [Twilio](https://twilio.com) and a phone number connected to an approved SMS campaign / messaging service to send outgoing messages. It can take some time to set this up; they want to make sure you're not a spammer. I used a US local number and a "Sole Proprietor A2P Messaging Service." They have decent instructions and customer support to help get you set up.
- You will also need a [WriteFreely](https://writefreely.org/) instance. This can be self-hosted, on managed hosting service, or through [Write.as](https://write.as/) (the API should be the same regardless)
- If you want to support images in your posts, you will also need an [ImgBB](https://imgbb.com/) account to host them

## Setup

1. Create a new Twilio serverless function called /incoming-txxt and paste in the code found in `/src/incoming-txxt.js`
  - In the Twilio web UI, serverless functions are under **Functions and Assets > Services**. You will need to create a new "service" and click into it, then create your function.
2. Add the following dependencies in the function settings:
  - `axios`
  - `imgbb-uploader`
  - `lodash`
  - `strftime`
  - (Keep the default dependencies added by Twilio as well)
3. Add the following environment variables in the function settings:
  - `WF_USER` - your WriteFreely username
  - `WF_PASS` - your WriteFreely password
  - `BLOG_URL` - the public URL of your writefreely blog (it should look like `https://yourblog.net`)
  - `WF_HOST` - your WriteFreely API url (it should look like `https://yourblog.net/api`)
  - `IMGBB_KEY` - your ImgBB api key (you can get this from the settings section of the [ImgBB site](https://imgbb.com/))
  - (Note: Twilio automatically provides your Twilio API credentials in their function environment)
4. Deploy your function.
4. Configure your Twilio phone number to trigger the function upon receiving an incoming text message. This was a bit tricky for me to figure out so I've detailed the process below.
  - In your Twilio account, go to **Phone Numbers > Manage > Active Numbers** and make sure that the phone number is connected to the messaging service you created in the "setup" step. This means that incoming messages will be handled by the messaging service configuration, which we will set in the next step.
  - Go to **Messaging > Services > {your messaging service name} > Integrations > Send a webhook**. You can then enter the webhook URL for your /incoming-txxt function. (To find this URL, go to the function editor UI and click the three-dot menu next to the function route `/incoming-txxt` and select "copy url". It will look like `https://{your function service domain base}.twil.io/incoming-txxt`)
5. Send a text message to your Twilio phone number, and view the blog URL when it replies. You should see your new post at the top of your blog.

## Troubleshooting Tip

In the Twilio function editor, there is a toggle labeled "Live logs off." If you switch it on, any `console.log()` messages in your code will appear live in the bottom panel, along with information about the function as it's triggered.

## Notes on latest version

In the latest version of this, I've added a weekly digest that sends out to a list managed by val.town, as well as a text message that goes to a specific moderator's number whenever a new post is created. I haven't fully documented these or added the code from the extra functions to this repo. If you want more info, get in touch via [my website](https://palomakop.tv).
