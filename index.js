var nopt    = require("nopt");
var path    = require("path");
var fs      = require("fs");
var mkdirp  = require("mkdirp");
var crypto  = require("crypto");
var _       = require("lodash");
var async   = require("async");
var gm      = require("gm");
var mmmagic = require("mmmagic")
var Mmmagic = mmmagic.Magic;
var ACCEPTED_MEDIA_TYPE_REGEXP = /^image\/(png|jpeg)$/;
var Picture = require("./picture");

var knownOpts = {
  "out": [String]
};

var shortHands = {
  "o": ["--out"]
};

var options = nopt(knownOpts, shortHands, process.argv, 2);
var sourcePaths = options.argv.remain;
var targetPath = options.out;
if (sourcePaths.length == 0) throw new Error("Please specify some source paths");
if (!targetPath) throw new Error("Please specify a target path");

var total = 0, done = 0, errors = 0, skipped = 0, discovered = false;

var queue = async.queue(function (picture, callback) {
  processPicture(picture, function (err) {
    if (err) {
      errors++;
      log("ERROR", picture, ":", err.message || err);
    }
    done++;
    callback(err);
  });
}, 8);

function run(callback) {
  console.log("Looking for pictures in", sourcePaths, "...");

  Picture.init(function () {
    async.eachSeries(sourcePaths, function (sourcePath, callback) {
      discoverPicturesUnderPath(sourcePath, function (picture, callback) {
        queue.push(picture);
        total++;
        callback();
      }, function (err, pictures) {
        if (err) return callback(err);
        callback();
      });
    }, function (err) {
      if (err) return callback(err);
      discovered = true;
      log("All pictures discovered.");
      // set the queue drain when all files are
      queue.drain = callback;
    });
  });
}

function discoverPicturesUnderPath(sourcePath, onPicture, callback) {
  fs.readdir(sourcePath, function(err, nodes) {
    if (err) return callback(err);

    var subDirectories = [];
    var files = [];

    var nodes = _.map(nodes, function (node) {
      return path.join(sourcePath, node);
    });

    async.eachSeries(nodes, function (node, callback) {
      fs.stat(node, function (err, stat) {
        if (err) return callback(err);

        if (stat.isDirectory())
          discoverPicturesUnderPath(node, onPicture, callback);
        else if (stat.isFile()) {
          files.push(node);
          callback();
        }
      });
    }, function (err) {
      if (err) return callback(err);

      async.eachSeries(files, function (file, callback) {
        mmm = new Mmmagic(mmmagic.MAGIC_MIME_TYPE);
        mmm.detectFile(file, function (err, mediaType) {
          if (err) return callback(new Error("ERR: " + err.message));
          if (ACCEPTED_MEDIA_TYPE_REGEXP.test(mediaType))
            onPicture(file, callback);
          else
            callback();
        });
      }, function (err) {
        if (err) return callback(err);
        callback(null);
      });
    });
  });
}

function processPicture(picturePath, callback) {
  var md5 = crypto.createHash('md5');

  //var s = fs.ReadStream(picturePath);
  //s.on('data', function(d) {
  //  md5.update(d);
  //  data.write(d.toString());
  //});

  //s.on('end', function() {
  fs.readFile(picturePath, function (err, content) {
    md5.update(content);
    var hash = md5.digest('hex');
    Picture.findOne({ hash: hash }, function (err, existingPicture) {
      if (err) return callback(err);
      if (existingPicture) {
        skipped++;
        log(picturePath, "is already imported");
        callback();
      } else {
        gm(content).identify(function (err, data) {
          var shotTime, exif = data["Profile-EXIF"];
          if (exif && (shotTime = exif["Date Time Original"] || exif["Date Time"])) {
            var shotTime = shotTime.split(/[^\d]+/);
            var targetPictureBasename = path.join(targetPath, shotTime[0], shotTime[1]);
            var targetPictureFilename = shotTime[2] + "_" + shotTime[3] + shotTime[4] + shotTime[5] + ".jpg";
            var targetPicturePath = path.join(targetPictureBasename, targetPictureFilename);

            mkdirp(targetPictureBasename, function (err) {
              if (err) return callback(err);

              fs.writeFile(targetPicturePath, content, function (err) {
                if (err) return callback(err);

                var picture = new Picture({
                  hash: hash,
                  originalPath: picturePath,
                  path: targetPicturePath,
                  shotTime: shotTime
                });
                picture.save(function (err) {
                  if (err) return callback(err);
                  log(picturePath, 'saved as', targetPicturePath);
                  callback();
                });
              });
            });
          } else {
            log(picturePath, "has no EXIF date");
            callback()
          }
        });
      }
    });
  });
}

run(function (err) {
  if (err) return console.log("ERROR", err);
  log("DONE");
  process.exit(0);
});

function log(msg) {
  var params = Array.prototype.slice.call(arguments);
  params.unshift("[" + done + "/" + (discovered ? "" : "~") + total + " Q:" + queue.length() + " S:" + skipped + " E:" + errors + "]");
  console.log.apply(console, params);
}
