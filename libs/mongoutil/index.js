'use strict';

exports.addressByUserIdQuery = (userId, db) =>
    db
        .collection('apiai_responses').aggregate([{
            $match: {
                'address.user.id': userId
            }
        }, {
            $limit: 1
        }, {
            $project: {
                name: { $arrayElemAt: [{ $split: ['$address.user.name', ' '] }, 0] },
                address: '$address'
            }
        }])
        .toArray();
