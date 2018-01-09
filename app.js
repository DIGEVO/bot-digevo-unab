
// var restify = require('restify');
// var builder = require('botbuilder');
// var botbuilder_azure = require("botbuilder-azure");

// var server = restify.createServer();
// server.listen(process.env.port || process.env.PORT || 3978, function () {
//    console.log('%s listening to %s', server.name, server.url); 
// });


// var connector = new builder.ChatConnector({
//     appId: process.env.MicrosoftAppId,
//     appPassword: process.env.MicrosoftAppPassword,
//     openIdMetadata: process.env.BotOpenIdMetadata
// });


// server.post('/api/messages', connector.listen());

// var tableName = 'botdata';
// var azureTableClient = new botbuilder_azure.AzureTableClient(tableName, process.env['AzureWebJobsStorage']);
// var tableStorage = new botbuilder_azure.AzureBotStorage({ gzipData: false }, azureTableClient);

// var bot = new builder.UniversalBot(connector);
// bot.set('storage', tableStorage);

// bot.dialog('/', function (session) {
//     session.send('You said ' + session.message.text);
// });

'use strict';

const builder = require('botbuilder');

require('dotenv').config();

const middleware = require('./libs/middleware');
const botUtils = require('./libs/bot-utils');

const connector = botUtils.buildConnector();
const bot = botUtils.buildBot(connector);

// Create server for listen messages
botUtils.startLocalServer(connector);
