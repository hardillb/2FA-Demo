var http = require('http');
var https = require('https');
var fs = require('fs');
var express = require('express');
var u2f = require('u2f');
var session = require('express-session');
var bodyParser = require('body-parser');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var TOTPStrategy = require('passport-totp').Strategy;
var morgan = require('morgan');
var path = require('path');
var cookieParser = require('cookie-parser');
var mongoose = require('mongoose');
var base32 = require('thirty-two');
var flash = require('connect-flash');

var Account = require('./models/account');
var G2FA = require('./models/g2fa');
var U2F_Reg = require('./models/u2f');

var port = (process.env.VCAP_APP_PORT || process.env.PORT ||3000);
var host = (process.env.VCAP_APP_HOST || '0.0.0.0');
var mongo_url = (process.env.MONGO_URL || 'mongodb://localhost/users');

if (process.env.VCAP_SERVICES) {
	var services = JSON.parse(process.env.VCAP_SERVICES);

	for (serviceName in services) {
		if (serviceName.match('^mongo')) {
			var creds = services[serviceName][0]['credentials'];
			mongo_url = creds.url;
		} else {
			console.log("no database found");
		}
	}
}

var app_id = 'https://localhost:' + port;

if (process.env.VCAP_APPLICATION) {
	var application = JSON.parse(process.env.VCAP_APPLICATION);

	var app_uri = application['application_uris'][0];

	app_id = 'https://' + app_uri;
}

var cookieSecret = 'zsemjy';

var app = express();

app.set('view engine', 'ejs');
app.set('trust proxy', 1);
app.use(morgan("combined"));
app.use(cookieParser(cookieSecret));
app.use(flash());
app.use(session({
  // genid: function(req) {
  //   return genuuid() // use UUIDs for session IDs
  // },
  secret: cookieSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
  	secure: true
  }
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
//app.use(flash);
app.use(passport.initialize());
app.use(passport.session());

function requireHTTPS(req, res, next) {
	if (req.get('X-Forwarded-Proto') === 'http') {
        //FYI this should work for local development as well
        var url = 'https://' + req.get('host');
        if (req.get('host') === 'localhost') {
        	url += ':' + port;
        }
        url  += req.url;
        return res.redirect(url); 
    }
    next();
}

app.use(requireHTTPS);

app.use('/',express.static('static'));


passport.use(new LocalStrategy(Account.authenticate()));
passport.use(new TOTPStrategy(function(user, done){
	G2FA.findOne({'username': user.username}, function(err, user){
		if (err) {
			return done(err);
		}
		return done(null, user.secret, 30);
	});
}));
passport.serializeUser(Account.serializeUser());
passport.deserializeUser(Account.deserializeUser());

mongoose.connect(mongo_url);

app.get('/', function(req,res){
	res.render('index', { message: req.flash('info') });
});

app.get('/login', function(req,res){
	res.render('login',{ message: req.flash('info') });
});

app.post('/login', passport.authenticate('local', { failureRedirect: '/login', successRedirect: '/2faCheck', failureFlash: true }));

app.get('/2faCheck', ensureAuthenticated, function(req,res){
	res.render('check2fa',{ message: req.flash('info') });
});

app.get('/newUser', function(req,res){
	res.render('register', { message: req.flash('info') });
});

app.post('/newUser', function(req,res){
	Account.register(new Account({ username : req.body.username }), req.body.password, function(err, account) {
		if (err) {
			console.log(err);
			return res.status(400).send(err.message);
		}

		passport.authenticate('local')(req, res, function () {
			console.log("created new user %s", req.body.username);
            res.status(201).send();
        });

	});
});

app.get('/setup2FA', ensureAuthenticated, function(req,res){
	res.render('setup2fa',{ message: req.flash('info') });
});

app.get('/setupG2FA', ensureAuthenticated, function(req,res){
	G2FA.findOne({'username': req.user.username}, function(err,user){
		if (err) {
			res.status(400).send(err);
		} else {
			var secret;
			if (user !== null) {
				secret = user.secret;
			} else {
				//generate random key
				secret = genSecret(10);
				var newToken = new G2FA({username: req.user.username, secret: secret});
				newToken.save(function(err,tok){

				});
			}
			var encodedKey = base32.encode(secret);
			var otpUrl = 'otpauth://totp/2FADemo:' + req.user.username + '?secret=' + encodedKey + '&period=30&issuer=2FADemo';
			var qrImage = 'https://chart.googleapis.com/chart?chs=166x166&chld=L|0&cht=qr&chl=' + encodeURIComponent(otpUrl);
			res.send(qrImage);
		}
	});
});

app.post('/loginG2FA', ensureAuthenticated, passport.authenticate('totp'), function(req, res){
	req.session.secondFactor = 'g2fa';
	res.send();
});

app.get('/registerU2F', ensureAuthenticated, function(req,res){
	try{
		var registerRequest = u2f.request(app_id);
		req.session.registerRequest = registerRequest;
		res.send(registerRequest);
	} catch (err) {
		console.log(err);
		res.status(400).send();
	}
	
});

app.post('/registerU2F', ensureAuthenticated, function(req,res){
	var registerResponse = req.body;
	var registerRequest = req.session.registerRequest;
	var user = req.user.username;
	try {
		var registration = u2f.checkRegistration(registerRequest,registerResponse);
		var reg = new U2F_Reg({username: user, deviceRegistration: registration });
		reg.save(function(err,r){

		});
		res.send();
	} catch (err) {
		console.log(err);
		res.status(400).send();
	}
});



app.get('/authenticateU2F', ensureAuthenticated, function(req,res){
	U2F_Reg.findOne({username: req.user.username}, function(err, reg){
		if (err) {
			res.status(400).send(err);
		} else {
			if (reg !== null) {
				var signRequest = u2f.request(app_id, reg.deviceRegistration.keyHandle);
				req.session.signrequest = signRequest;
				req.session.deviceRegistration = reg.deviceRegistration;
				res.send(signRequest);
			}
		}
	});
});

app.post('/authenticateU2F', ensureAuthenticated, function(req,res){
	var signResponse = req.body;
	var signRequest = req.session.signrequest;
	var deviceRegistration = req.session.deviceRegistration;
	try {
		var result = u2f.checkSignature(signRequest, signResponse, deviceRegistration.publicKey);
		if (result.successful) {
			req.session.secondFactor = 'u2f';
			res.send();
		} else {
			res.status(400).send();
		}
	} catch (err) {
		console.log(err);
		res.status(400).send();
	}
});

app.get('/logout', function(req,res){
	req.logout();
	req.session.secondFactor = undefined;
	res.redirect('/login')
});

app.get('/user', ensureAuthenticated, ensure2fa, function(req, res) {
	res.render('user',{name: req.user.username, message: req.flash('info')});
});

function ensureAuthenticated(req,res,next) {
	if (req.isAuthenticated()) {
    	return next();
	} else {
		res.redirect('/login');
	}
}

function ensure2fa(req, res, next) {
	if (req.session.secondFactor) {
		return next();
	}
	res.redirect('/2faCheck');
}

function genSecret(len) {
	var buf = []
	, chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
	, charlen = chars.length;

	for (var i = 0; i < len; ++i) {
		buf.push(chars[getRandomInt(0, charlen - 1)]);
	}

	return buf.join('');
};

function getRandomInt(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}


var server = http.Server(app);
if (app_id.match(/^https:\/\/localhost:/)) {
	var options = {
		key: fs.readFileSync('server.key'),
		cert: fs.readFileSync('server.crt')
	};
	server = https.createServer(options, app);
} 


server.listen(port, host, function(){
	console.log('App listening on  %s:%d!', host, port);
	console.log("App_ID -> %s", app_id);
});

