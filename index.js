const config = require("./config.js");
/**
 * The framework used to handle requests.
 */
const express = require("express");
/**
 * The framework instance.
 */
const app = express();
/**
 * The connection to Heroku Database.
 */
const pool = require("./utilities").pool;

const middleware = require("./middleware");

app.use(express.json());

app.use(middleware.jsonErrorInBody);

app.use('/test', require('./routes/hello.js'));

app.use('/auth', require('./routes/register.js'));

app.use('/auth', require('./routes/login.js'));

app.use('/chats', middleware.checkToken, require('./routes/chats.js'));

app.use('/messages', middleware.checkToken, require('./routes/messages.js'));

app.use('/auth', middleware.checkToken, require('./routes/pushyregister.js'));

app.use('/contacts', middleware.checkToken, require('./routes/contacts.js'));

app.use('/search', middleware.checkToken, require('./routes/search.js'));

app.use("/doc", express.static('apidoc'));

app.use('/forecast', middleware.checkToken, require('./routes/forecast.js'));

app.use('/location', middleware.checkToken, require('./routes/location.js'));

app.use('/verify', require('./routes/verify.js'));

app.use('/user', middleware.checkToken,require('./routes/user.js'));

app.use('/changePassword', middleware.checkToken,require('./routes/changePassword.js'));


app.listen(config.PORT || 5000, () => {
  console.log("Server up and running on port: " + (config.PORT || 5000));
});
