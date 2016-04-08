# 2FA-Demo

An application to demo providing multiple [Two Factor Authentication][1] mechanisms.

The application supports both TOTP method supported by the [Google Authenticator][2] application and [U2F][3] authentication tokens.

Way more detail can be found on my blog post about this [here][4]

## Running

The application requires a Mongodb database to act as a backend to store user credentials. The database URL can be either passed 
in with the environment variable `MONGO_URL` or picked up from `VCAP_SERVICES`, it defaults to `mongodb://localhost/users`

https is required, a selfsigned certificate for localhost is included, but these should be replaced for a proper deployment.

Clone the project, run

`npm install`

Then

`node index.js`

Point your browser [https://localhost:3000][5]

[1]: https://en.wikipedia.org/wiki/Two-factor_authentication
[2]: https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2
[3]: https://en.wikipedia.org/wiki/Universal_2nd_Factor
[4]: http://www.hardill.me.uk/wordpress/2016/03/30/adding-2-factor-authentication-to-your-expressjs-app/
[5]: https://localhost:3000