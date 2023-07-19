require('dotenv').config();

const fs = require('fs');
const path = require('path');
const ssh2 = require('ssh2');
const keygen = require('ssh-keygen');
const { WebhookClient, EmbedBuilder } = require('discord.js');

const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

const webhookClient = new WebhookClient({ url: webhookUrl });

console.log('Starting SSH honeypot...');

const config = {
  port: process.env.SSH_PORT || 22,
  falsePositiveRatio: process.env.FALSE_POSITIVE_RATIO || 0.01,
  privateKeyPath: process.env.PRIVATE_KEY_PATH || 'host.key',
  footer: process.env.HONEYPOT_NAME || 'Honeypot.js',
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
  main();
}

function logToDiscord(message) {
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setDescription(message)
      .setTimestamp()
      .setFooter({ text: config.footer });
  
    webhookClient.send({ embeds: [embed] });
  }
  

function main() {
  new ssh2.Server({
    hostKeys: [fs.readFileSync(config.privateKeyPath)],
  }, function (client, info) {
    console.log(`${info.ip} >>> Connection`);
    logToDiscord(`[${info.ip}] Connection`);

    client.on('authentication', function (ctx) {
      if (ctx.method === 'password') {
        fs.appendFile('log.txt', `${info.ip}|${ctx.username}:${ctx.password}\n`, function (err) {
          if (err) return console.error(err);
        });
        const falsePositive = Math.random() <= config.falsePositiveRatio;
        if (falsePositive) {
          console.log(`${client._sock.remoteAddress} >> '${ctx.username}' | '${ctx.password}' - ACCEPTED`);
          logToDiscord(`[${info.ip}] '${ctx.username}' | '${ctx.password}' - ACCEPTED`);
          ctx.accept();
        } else {
          console.log(`${client._sock.remoteAddress} >> '${ctx.username}' | '${ctx.password}' - REJECTED`);
          logToDiscord(`[${info.ip}] '${ctx.username}' | '${ctx.password}' - REJECTED`);
          return ctx.reject(['password']);
        }
      } else {
        return ctx.reject(['password']);
      }
    }).on('ready', function () {
      console.log(`${client._sock.remoteAddress} >>> Authenticated (Not really of course :p)`);
      logToDiscord(`[${info.ip}] Authenticated (Not really of course :p)`);

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
      logToDiscord(`[${info.ip}] Disconnected`);
    }).on('close', function () {
      console.log(`${client._sock.remoteAddress} >>> Connection closed`);
      logToDiscord(`[${info.ip}] Connection closed`);
    }).on('error', () => {});
  }).listen(config.port, '0.0.0.0', function () {
    console.log(`Listening on 0.0.0.0:${this.address().port}`);
  });
}
