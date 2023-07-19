const fs = require('fs');
const path = require('path');
const ssh2 = require('ssh2');
const keygen = require('ssh-keygen');
const { WebhookClient, EmbedBuilder } = require('discord.js');

const isInDocker = fs.existsSync("/.dockerenv");

let rawconfig

if (!isInDocker) {
  rawconfig = require("dotenv").config().parsed;
  mode = "Local";
} else {
  rawconfig = process.env;
  mode = "Docker";
}

const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

const webhookClient = new WebhookClient({ url: webhookUrl });

const config = {
  port: rawconfig.SSH_PORT || 22,
  falsePositiveRatio: rawconfig.FALSE_POSITIVE_RATIO || 0.01,
  privateKeyPath: rawconfig.PRIVATE_KEY_PATH || 'host.key',
  footer: rawconfig.HONEYPOT_NAME || 'Honeypot.js',
};

if (!config.port || !config.falsePositiveRatio || !config.privateKeyPath) {
  console.error('There\'s a problem in the configuration!');
  process.exit(1);
}

if (!fs.existsSync(config.privateKeyPath)) {
  console.warn('No key found in the specified path, generating new ones...');

  keygen({
    location: path.join(__dirname, config.privateKeyPath),
    comment: 'No comment',
    password: false,
    read: true,
  }, (err, out) => {
    if (err) return console.error(`Something went wrong while generating RSA keys: ${err}`);
    console.log('Keys created!');
    console.log('Private key: ' + out.key);
    console.log('Public key: ' + out.pubKey);
    main();
  });
} else {
    console.log(`---------------------------`);
console.log(`Honeypot.js, V1.0`);
console.log(`https://github.com/ChokunPlayZ/`);
console.log(`---------------------------`);
console.log(`Mode: ${mode}`);
console.log(`In Container: ${isInDocker}`);
console.log(
  `System Timzone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`
);
console.log(`-----------Configs---------`);
  main();
}

function logToDiscord(data) {
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .addFields(data)
      .setTimestamp()
      .setFooter({ text: config.footer });
  
    webhookClient.send({ embeds: [embed] });
  }
  

function main() {
  new ssh2.Server({
    hostKeys: [fs.readFileSync(config.privateKeyPath)],
  }, function (client, info) {
    console.log(`${info.ip} >>> Connection`);
    logToDiscord([
        { name: "Type", value: `Connection Established`, inline: false },
        { name: "IP", value:`${info.ip}`}
      ])

    client.on('authentication', function (ctx) {
      if (ctx.method === 'password') {
        fs.appendFile('log.txt', `${info.ip}|${ctx.username}:${ctx.password}\n`, function (err) {
          if (err) return console.error(err);
        });
        const falsePositive = Math.random() <= config.falsePositiveRatio;
        if (falsePositive) {
          console.log(`${client._sock.remoteAddress} >> '${ctx.username}' | '${ctx.password}' - ACCEPTED`);
          logToDiscord([
            { name: "Type", value: `Authentication Attempt (ACCEPTED)`, inline: false },
            { name: "IP", value:`${info.ip}`},
            { name: "Username", value:`${ctx.username}`},{ name: "Password", value:`${ctx.password}`}
          ])
          ctx.accept();
        } else {
          console.log(`${client._sock.remoteAddress} >> '${ctx.username}' | '${ctx.password}' - REJECTED`);
          logToDiscord([
            { name: "Type", value: `Authentication Attempt (REJECTED)`, inline: false },
            { name: "IP", value:`${info.ip}`},
            { name: "Username", value:`${ctx.username}`},{ name: "Password", value:`${ctx.password}`}
          ])
          return ctx.reject(['password']);
        }
      } else {
        return ctx.reject(['password']);
      }
    }).on('ready', function () {
      console.log(`${client._sock.remoteAddress} >>> Authenticated (Not really of course :p)`);
      logToDiscord(`[${info.ip}] Authenticated (Not really of course :p)`);
      logToDiscord([
        { name: "Type", value: `Authenticated (Not Really Suckers)`, inline: false },
        { name: "IP", value:`${info.ip}`},
      ])

      client.on('session', function (accept, reject) {
        const session = accept();
        session.once('shell', function (accept, _, _) {
          const stream = accept();
          stream.write('Welcome Visitor !\n');
          stream.exit(0);
          stream.end();
          reject();
        });
      });
    }).on('end', function () {
      console.log(`${client._sock.remoteAddress} >>> Disconnected`);
      logToDiscord([
        { name: "Type", value: `Disconnected`, inline: false },
        { name: "IP", value:`${info.ip}`},
      ])
    }).on('close', function () {
      console.log(`${client._sock.remoteAddress} >>> Connection closed`);
      logToDiscord([
        { name: "Type", value: `Connection Closed`, inline: false },
        { name: "IP", value:`${info.ip}`},
      ])
    }).on('error', () => {});
  }).listen(config.port, '0.0.0.0', function () {
    console.log(`Listening on 0.0.0.0:${this.address().port}`);
    logToDiscord([
        { name: "Type", value: `Status: Listening`, inline: false },
      ])
  });
}
