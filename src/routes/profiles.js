const express = require('express');
const router = express.Router();
const { getProfiles, searchProfiles, createProfile } = require('../controllers/profiles');

router.get('/search', searchProfiles);
router.get('/', getProfiles);
router.post('/', createProfile);

module.exports = router;