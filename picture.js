var mongoose = require("mongoose");
var pictureSchema = new mongoose.Schema({
  hash: {
    type: String,
    unique: true
  },
  path: {
    type: String,
    unique: true
  },
  originalPath: {
    type: String
  },
  shotTime: {
    type: Array
  }
});

var Picture = mongoose.model("Picture", pictureSchema);

Picture.init = function (callback) {
  mongoose.connect('mongodb://localhost/picport');
  var db = mongoose.connection;
  db.on('error', console.error.bind(console, 'connection error:'));
  db.once('open', callback);
};

module.exports = Picture;

