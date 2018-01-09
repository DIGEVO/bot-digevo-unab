'use strict';

const format = require('string-format');
const builder = require("botbuilder");
const locationDialog = require('botbuilder-location');
const rp = require('request-promise-native');
const uuid = require('uuid');
require('dotenv').config();

const apiairecognizer = require('../api-ai-recognizer');
const utils = require('../middleware-utils');
const clientLocation = require('../client_location_service');
const Intercom = require('../intercom');
const mongoClient = require('../mongodb');
const mongoUtil = require('../mongoutil');

//TODO Debo cambiarlo para que lo consulte en BD o env
const getLocationType = typeLocation => {
    if (typeLocation === 'facultades')
        return '59c2765a518a97998d3a6d84';
    else if (typeLocation === 'sedes')
        return '59c27671518a97998d3a7bad';
    else if (typeLocation === 'departamentos')
        return '59cdccd158a4d569e5120997';
    else
        return '59c27671518a97998d3a7bad';
}

const firstStep = (session, args, next) => {
    const facebookEntities = builder.EntityRecognizer.findAllEntities(args.entities, 'facebook');

    if (facebookEntities.length) {
        facebookEntities.forEach(element => {
            switch (element.entity.type) {
                case 0:
                    session.send(element.entity.speech);
                    break;
                case 2:
                    builder.Prompts.choice(session, element.entity.title, element.entity.replies.join('|'));
                    session.endDialog();
                    break;
            }
        });
    }
    else {
        next(session, args, secondStep);
    }
}

const secondStep = (session, args) => {
    const locationEntity = builder.EntityRecognizer.findEntity(args.entities, 'Locations');

    if (locationEntity)
        session.userData.locationType = getLocationType(locationEntity.entity);

    switch (args.intent) {
        case 'locations-near':
            session.beginDialog('/preguntarLugar');
            break;

        case 'locations-search':
            clientLocation.SearchLocations(process.env.BOT_ID, null, locationEntity.entity)
                .then(value => session.send(
                    value ?
                        new builder.Message(session)
                            .attachmentLayout(builder.AttachmentLayout.carousel)
                            .attachments(LocationsToHeroCards([].concat(value), builder, session)) :
                        'No se encontraron registros'))
                .catch(reason => console.error('Something went wrong', reason));
            break;

        case 'locations-list':
            clientLocation.AllLocations(process.env.BOT_ID, session.userData.locationType)
                .then(value => {
                    const arrValue = [].concat(value || []);
                    session.send(
                        arrValue.length ?
                            new builder.Message(session)
                                .attachmentLayout(builder.AttachmentLayout.carousel)
                                .attachments(LocationsToHeroCards(arrValue, builder, session)) :
                            'No se encontraron registros');
                })
                .catch(reason => console.error('Something went wrong', reason));
            break;

        default:
            builder.EntityRecognizer
                .findAllEntities(args.entities, 'fulfillment')
                .forEach(element => session.send(element.entity));
            break;
    }
}

const getDefaultIntent = (session) => {
    var recognizer = new apiairecognizer(process.env['ApiAiToken']);
    return new builder.IntentDialog({ recognizers: [recognizer] })
        .onDefault((session, args) => {
            session.sendTyping();

            const channelId = session.message.address.channelId;
            const userId = session.message.user.id;

            isHTO(session)
                .then(res => {
                    if (res.isHTO) {
                        changeMessage(session, res)
                            .then(() => sendMessage(session))
                            .catch(e => console.error(e.message));
                        return;
                    }

                    if (channelId === 'directline' && userId === 'IntercomChannel') {
                        sendMessage(session);
                        return;
                    }

                    const cacheData = utils.cache.get(userId) || { paused: false };
                    if (!cacheData.paused)
                        firstStep(session, args, secondStep);
                })
                .catch(e => console.error(e.message));
        })
}

const isHTO = (session) => {
    const channelId = session.message.address.channelId;
    const userId = session.message.user.id;
    const cacheData = utils.cache.get(userId.toString()) || { paused: false };

    if ((channelId === 'directline' && userId === 'IntercomChannel') || cacheData.paused) {
        return Promise.resolve({ isHTO: false, speech: '' });
    } else {
        return rp
            .post({
                method: 'POST',
                auth: { 'bearer': process.env.DIALOGFLOW_TOKEN },
                uri: process.env.URL,
                body: {
                    query: session.message.text.substring(0, 200),
                    //sessionId: (userId + channelId).slice(0, 35),
                    sessionId: userId.split('').reverse().join('').slice(0, 35),
                    lang: 'es'
                },
                json: true,
                encoding: 'utf8'
            })
            .then(data => {
                console.log(`----> 3: text=${data.result.resolvedQuery} action=${data.result.action} id=${data.sessionId}`);
                return ({ isHTO: data.result.action === 'HTO', speech: data.result.fulfillment.speech });
            })
            .catch(e => console.error(e.message));
    }
};

const changeMessage = (session, res) => {
    const userId = session.message.user.id;
    const cacheData = utils.cache.get(userId) || { paused: false };

    if (!cacheData.paused) {
        return new Promise((resolve, reject) => {
            const msg = {
                userId: session.message.user.id,
                paused: true,
                text: res.speech,
                originalText: session.message.text
            };
            session.message.text = JSON.stringify(msg);
            resolve(true);
        });
    } else {
        return Promise.resolve(true);
    }
}

const setDialogs = (bot) => {
    bot.dialog('/', getDefaultIntent());
    bot.dialog('/preguntarLugar', [askLocation, processLocation]);
}

function askLocation(session, args, next) {
    locationDialog.getLocation(
        session,
        {
            prompt: "Necesito tu ubicación para mostrarte las localidades más cercanas a ti.",
            useNativeControl: true,
            skipFavorites: true,
            skipConfirmationAsk: true
        });
}

function processLocation(session, results, next) {
    new Promise((resolve, reject) => {
        return results.response ?
            resolve(clientLocation.NearLocations(
                process.env.BOT_ID,
                session.userData.locationType,
                results.response.geo.latitude,
                results.response.geo.longitude)) :
            resolve('Lo siento, no pude determinar tu ubicación.');
    })
    then(msg => {
        session.send(msg);
        session.endDialog();
    });
}

const sendMessage = (session) => {
    const msg = JSON.parse(session.message.text);
    if (msg.originalText) session.message.text = msg.originalText;
    const cacheData = utils.cache.get(msg.userId.toString()) || { paused: false };

    cacheData.paused = msg.paused;
    utils.cache.set(msg.userId, cacheData);

    mongoClient.processQuery(
        mongoUtil.addressByUserIdQuery.bind(null, msg.userId),
        ([data]) => {
            if (!data) {
                const topic = msg.text ? `el mensaje ${msg.text}` : `la desactivación/activación del bot`;
                const errorMsg = `Error: No se pudo enviar "${topic}" ` +
                    `al cliente "${msg.userId}" porque la dirección del mismo no aparece en la db.`;
                console.error(errorMsg);

                if (session.message.user.id === 'IntercomChannel' && session.message.address.channelId === 'directline') {
                    session.send(errorMsg);
                }
                return;
            }

            if (msg.text) {
                session.library.send(new builder.Message().text(msg.text).address(Object.assign(data.address,
                    { mute: session.message.user.id === 'IntercomChannel' && session.message.address.channelId === 'directline' })));
            }

            if (session.message.user.id === 'IntercomChannel' && session.message.address.channelId === 'directline') {
                session.send(msg.text ? 'Mensaje enviado.' : 'Detención/Activación del bot.');
            }
        });
}

const getText = (msg, name) => msg.text || (msg.paused ?
    `Hola${name}, a partir de este momento hablarás con una persona.` :
    `Hola${name}, a partir de este momento hablarás con la plataforma.`)
    ;

const LocationsToHeroCards = (locations, builder, session) =>
    locations.map(location => new builder.HeroCard(session)
        .title(location.name)
        .subtitle(location.ciudad)
        .text(location.address)
        .images([builder.CardImage.create(session, format(process.env.GMAPS_URL,
            location.geo.coordinates[0],
            location.geo.coordinates[1],
            location.geo.coordinates[0],
            location.geo.coordinates[1]))
        ])
        .buttons([builder.CardAction.openUrl(session, location.url_map, 'Abrir Mapa')]));

module.exports = { setDialogs: setDialogs };