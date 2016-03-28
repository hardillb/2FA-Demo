var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var G2FA = new Schema({
    username: String,
    secret: String
});

module.exports = mongoose.model('G2FA', G2FA);