const User = require('../models/User');
const Message = require('../models/Message');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const keys = require('../config/keys');
const uniqueString = require('unique-string');

module.exports = {
  greet: (req, res) => {
    res.render('login');
  },
  getRegister: (req, res) => {
    res.render('register');
  },
  postNewThread: async (req, res) => {
    const { recipientId, senderId } = req.body;
    const { recipient, sender } = await newThread(recipientId, senderId);

    if (!recipient && !sender) {
      res.status(500).send('Server error');
    } else {
      res.status(201).send({recipient, sender});
    }
  },
  findUserById: async (req, res) => {
    const { _id } = req.query;
    const user = await User.findById(_id, '_id name messages');
    user ? res.status(200).send(user) : res.status(500);
  },
  findById: async (req, res) => {
    const { from, to } = req.query;
    const user = await User.findById(from);
    const { messages } = user;
    const { name } = user;
    let messageHistory, roomId;
    const history = messages.get(to);
    if (history && history.roomId) {
      ({ roomId } = history);
      messageHistory = await Message.find({
        _id: { $in: history['messageHistory'] }
      });
      res.status(200).send({ name, messageHistory, roomId });
    } else {
      ({ messageHistory, roomId } = await newThread(from, to));
      res.status(200).send({ name, messageHistory, roomId });
    }
  },
  findAll: async (req, res) => {
    const users = await User.find({}, '_id name messages', (err, data) => {
      if (err) {
        return;
      } else return data;
    });

    if (users) {
      res.status(200).send(users);
    } else {
      res.status(500);
    }
  },
  postRegister: (req, res) => {
    const { name, email, password, password2 } = req.body;
    let errors = [];

    //Field checks
    if (!name || !email || !password || !password2) {
      errors.push({ msg: 'Please fill in all fields' });
    }
    if (password !== password2) {
      errors.push({ msg: 'Passwords do not match' });
    }
    if (password.length < 6) {
      errors.push({ msg: 'Password should be at least 6 characters' });
    }

    if (errors.length > 0) {
      res.status(400).json({ errors: errors });
    } else {
      User.findOne({ email: email }).then(user => {
        if (user) {
          errors.push({ msg: 'Email is already registered' });
          res.status(400).json({ email: 'Email is already registered' });
        } else {
          const newUser = new User({
            name,
            email,
            password,
            messages: {}
          });

          bcrypt.genSalt(10, (err, salt) =>
            bcrypt.hash(newUser.password, salt, (err, hash) => {
              if (err) throw err;
              newUser.password = hash;
              newUser
                .save()
                .then(user => {
                  const payload = { id: user.id, name: user.name };
                  jwt.sign(
                    payload,
                    keys.secretOrKey,
                    { expiresIn: 3600 },
                    (err, token) => {
                      res.json({
                        success: true,
                        token: 'Bearer ' + token
                      });
                    }
                  );
                })
                .catch(err => console.log(err));
            })
          );
        }
      });
    }
  },
  login: (req, res, next) => {
    passport.authenticate('local', {
      successRedirect: '/dashboard',
      failureRedirect: '/users/login',
      failureFlash: true
    })(req, res, next);
  },
  logout: (req, res) => {
    req.logout();
    req.flash('success_msg', 'Successfully logged out');
    res.redirect('login');
  },
  tokenLogin: (req, res) => {
    let errors = {};
    const email = req.body.email;
    const password = req.body.password;

    User.findOne({ email }).then(user => {
      if (!user) {
        errors.email = 'This user does not exist';
        return res.status(400).json(errors);
      }

      bcrypt.compare(password, user.password).then(isMatch => {
        if (isMatch) {
          const payload = {
            _id: user._id,
            name: user.name
          };

          jwt.sign(
            payload,
            keys.secretOrKey,
            { expiresIn: 3600 },
            (err, token) => {
              res.json({
                success: true,
                token: 'Bearer ' + token
              });
            }
          );
        } else {
          errors.password = 'Incorrect password';
          return res.status(400).json(errors);
        }
      });
    });
  },
  getCurrentUser: (req, res) => {
    res.json({
      id: req.user._id,
      name: req.user.name,
      email: req.user.email
    });
  }
};

async function newThread(senderId, recipientId) {
  const recipient = await User.findById(recipientId);
  const sender = await User.findById(senderId);
  const uniqStr = uniqueString();
  const history = {
    roomId: uniqStr,
    messageHistory: []
  };
  recipient.messages.set(senderId, history);
  sender.messages.set(recipientId, history);
  try {
    recipient.save();
    sender.save();
  } catch {
    console.log(err);
  } finally {
    return {recipient, sender};
  }
}