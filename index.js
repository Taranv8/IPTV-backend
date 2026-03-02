const express = require('express');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
app.use(require('cors')());

const MONGO_URI = "mongodb+srv://tandam:61UMWpsKROnyAvXm@cluster0.cqnwuiv.mongodb.net/?appName=Cluster0";
const DB_NAME = "IPTV";
const COLL_NAME = "channelinfo";

let db;

MongoClient.connect(MONGO_URI)
  .then(client => {
    db = client.db(DB_NAME);
    console.log('✅ Connected to MongoDB');
    
    // Immediately test the collection
    db.collection(COLL_NAME).countDocuments().then(count => {
      console.log(`📺 Total documents in ${COLL_NAME}:`, count);
    });

    db.collection(COLL_NAME).findOne().then(doc => {
      console.log('📄 Sample document:', JSON.stringify(doc, null, 2));
    });
  })
  .catch(err => console.error('❌ MongoDB connection error:', err));

app.get('/channels', async (req, res) => {
  try {
    const count = await db.collection(COLL_NAME).countDocuments();
    console.log('Request received, count:', count);
    
    const channels = await db.collection(COLL_NAME).find({}).limit(10).toArray();
    console.log('Fetched channels:', channels.length);
    
    res.json({ total: count, data: channels });
  } catch (err) {
    console.error('❌ Query error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));