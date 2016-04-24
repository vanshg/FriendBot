var express = require('express')
var bodyParser = require('body-parser')
var request = require('request')
var MongoClient = require('mongodb').MongoClient
    , assert = require('assert');
var app = express()
var db = null

var url = "mongodb://root:Nishank@ds017231.mlab.com:17231/gofriendbot"
MongoClient.connect(url, function(err, database) {
  assert.equal(null, err);
  console.log("Connected correctly to server");
  db = database
});

app.use(express.static('fb-website'));

app.set('port', (process.env.PORT || 5000))

// Process application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({extended: false}))

// Process application/json
app.use(bodyParser.json())

// for Facebook verification
app.get('/webhook/', function (req, res) {
    if (req.query['hub.verify_token'] === 'test123') {
        res.send(req.query['hub.challenge'])
    }
    res.send('Error, wrong token')
})

// Spin up the server
app.listen(app.get('port'), function() {
    console.log('running on port', app.get('port'))
})

app.post('/webhook/', function (req, res) {
    messaging_events = req.body.entry[0].messaging
    for (i = 0; i < messaging_events.length; i++) {
        event = req.body.entry[0].messaging[i]
        sender = event.sender.id
        if (event.message && event.message.text) {
            text = event.message.text
            addUserIfDoesNotExist(sender)
            if (text.startsWith("@start")) {
                pairUser(sender)
            } else if(text.startsWith("@quit")) {
                unpairUser(sender)
                text = "The chat has been disconnected"
            } else if (text.startsWith("help")) {
            	text = "Hi, and welcome to FriendBot!\n\nYou can use FriendBot to meet new people and make new connections. To get started, just type @start. You will immediately be paired with someone, and you can start chatting. Once you're in the chat, simply type @quit to disconnect from your current conversation.\n\nHappy chatting!"
                sendTextMessage(sender, text)
                res.sendStatus(200)
                return;
            }
            sendFriendMessage(sender, text)
        }
    }
    res.sendStatus(200) //Successful
})

var token = "CAAGZCjqmOZAN0BAHdHJ5KqHuxZCekEMGV0maLkq2UQXDApJ9FEKto041YOE1JLYEHZCRyB3jcb5RAi7p0gAh4HBZAZC798u7axmkAbno9kGF9YZCEdZBk9qK8F68BZBnLatoZAexaIxfwueIWyZCgWFKk9ZA5wmhckKh3LHTju47yiSUPzgLclle9ZBR5ZCHH4KVLmb5ZAZB6h92AIdXiwZDZD"


function sendFriendMessage(sender, text) {
    var collection = db.collection('currentconvos')
    var result1 = collection.find({}).filter({id1: sender})
    result1.count(function(err, numResults) {
        if (numResults != 0) {
            result1.each(function(err, otherUser) {
                if (err) throw err
                if (otherUser != null) {
                    sendTextMessage(otherUser['id2'], text)
                }
            })
        }
    })
    var result2 = collection.find({}).filter({id2: sender})
    result2.count(function(err, numResults) {
        if (numResults != 0) {
            result2.each(function(err, otherUser) {
                if (err) throw err
                if (otherUser != null) {
                    console.log(otherUser['id1'])
                    sendTextMessage(otherUser['id1'], text)
                }
            })
        }
    })
}


function sendTextMessage(sender, text) {
    messageData = {
        text:text
    }
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token:token},
        method: 'POST',
        json: {
            recipient: {id:sender},
            message: messageData,
        }
    }, function(error, response, body) {
        if (error) {
            console.log('Error sending messages: ', error)
        } else if (response.body.error) {
            console.log('Error: ', response.body.error)
        }
    })
}

var addUser = function(user, name) {
    var collection = db.collection('allusers')
    collection.insert({
        Name: name,
        id: user,
        inConvo: false
    }, function(err, returnedUser) {
        if (err) throw err
        //Nothing further we need to do
    })
}

var addUserIfDoesNotExist = function(user) {
    var found = false;
    var collection = db.collection('allusers')
    var cursor = collection.find({}).filter({id:user})
    cursor.count(function(err, numDocs) {
        if (numDocs == 0) {
            addUser(user, "")
        }
    })
}


var pairUser = function(user) {
    var otherUserID = null
    var allUsers = db.collection('allusers')
    var cursor = allUsers.find({"id":{$nin:[user]}, inConvo:{$in: [false]}})
    cursor.count(function(err, numDocs) {
        var rand = Math.floor(Math.random()*numDocs)
        var randomUserCursor = allUsers.find({"id":{$nin:[user]}, inConvo:{$in: [false]}}).limit(1).skip(rand)
        randomUserCursor.each(function(err, otherUser) {
            if (err) throw err
            if (otherUser != null) {
                var convos = db.collection('currentconvos')
                otherUserID = otherUser['id']
                convos.insert({
                    id1: user,
                    id2: otherUserID
                }, function(err, convo){
                    if (err) throw err
                    sendTextMessage(otherUserID, "You are now connected. Happy chatting!")
                    sendTextMessage(user, "You are now connected. Happy chatting!")
                    //Nothing further we need to do
                })

                allUsers.updateOne(
                    {id:{$in: [user]}},
                    {$set: {"inConvo": true}},
                    function(err, results) {
                        if (err) throw err
                        //Nothing further we need to do
                    }
                )
                allUsers.updateOne({
                    id:{$in: [otherUserID]}},
                    {$set: {"inConvo": true}},
                    function(err, results) {
                        if (err) throw err
                        //Nothing further we need to do
                    }
                )
            }
        })
    })
}

var unpairUser = function(user) {
    var otherUserID = null
    var allUsers = db.collection('allusers')
    var cursor = allUsers.find({"id":{$nin:[user]}, inConvo:{$in: [true]}})
    cursor.count(function(err, numDocs) {
        var userCursor = allUsers.find({"id":{$nin:[user]}, inConvo:{$in: [true]}})
        userCursor.each(function(err, otherUser) {
            if (err) throw err
            if (otherUser != null) {
                console.log(otherUser)
                console.log(otherUser['id'])
                var convos = db.collection('currentconvos')
                otherUserID = otherUser['id']
                convos.remove({
                    id1: user,
                    id2: otherUser['id']
                }, function(err, returnedUser){
                    if (err) throw err
                    //Nothing further we need to do
                })
                convos.remove({
                    id1: otherUser['id'],
                    id2: user
                }, function(err, returnedUser){
                    if (err) throw err
                    //Nothing further we need to do
                })
                allUsers.updateOne(
                    {id:{$in: [user]}},
                    {$set: {"inConvo": false}},
                    function(err, results) {
                        if (err) throw err
                        //Nothing further we need to do
                    }
                )
                allUsers.updateOne({
                    id:{$in: [otherUserID]}},
                    {$set: {"inConvo": false}},
                    function(err, results) {
                        if (err) throw err
                        //Nothing further we need to do
                    }
                )
            }
        })
    })
}
