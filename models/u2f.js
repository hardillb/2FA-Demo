var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var U2F = new Schema({
    username: String,
    deviceRegistration: {
    	keyHandle: String,
    	publicKey: String,
    	certificate: String
    }
});

module.exports = mongoose.model('U2F', U2F);