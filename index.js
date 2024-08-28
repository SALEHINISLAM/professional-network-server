const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express()
const jwt = require('jsonwebtoken')

require('dotenv').config()
const port = process.env.PORT || 5001

//middleware
app.use(cors())
app.use(express.json())


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.bdqfb.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const database = client.db('ProfessionalNetworkDB')
    const employerPriceCollection = database.collection('employerPricing')
    const usersCollection = database.collection('users')
    const jobsCollection = database.collection('jobs')
    const applicantsCollection = database.collection('applicants')
    const investmentProposalCollection = database.collection('investmentProposals')

    //verify related api
    const verifyToken = (req, res, next) => {
      console.log(req.headers?.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "forbidden access" })
      }
      const token = req.headers.authorization.split(' ')[1];
      if (!token) {
        return
      }
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "forbidden access" })
        }
        req.decoded = decoded;
        next()
      })
    }

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: "unauthorized access" })
      }
      next()
    }

    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
      res.send({ token });
    })

    app.get('/users', async (req, res) => {
      const result = await usersCollection.find().toArray()
      res.send(result)
    })

    app.post('/user', async (req, res) => {
      const user = req.body;
      console.log(user);
      const query = { email: user.email };
      try {
        const existingUser = await usersCollection.findOne(query);
        if (existingUser) {
          return res.status(400).send({ message: 'User already exists' });
        }
        const result = await usersCollection.insertOne(user);
        res.send(result);
      } catch (err) {
        console.error('Error adding new user:', err);
        res.status(500).send({ message: 'Failed to add user', error: err });
      }
    });

    app.get(`/user`, async (req, res) => {
      const userInfo = req.query.email;
      const query = { email: userInfo };
      console.log(query);
      const isUserExist = await usersCollection.findOne(query);
      if (isUserExist) {
        res.send(isUserExist)
      }
      else {
        res.send({ message: 'userNotFound' })
      }
    })

    app.put(`/userInfo/edit/:id`, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      console.log(query);
      const updatedInfo = { $set: req.body };
      const options = { upsert: true };
      try {
        const result = await usersCollection.updateOne(query, updatedInfo, options);
        res.send(result);
      } catch (err) {
        console.error('Error updating user info:', err);
        res.status(500).send({ message: 'Failed to update user info', error: err });
      }
    });
    
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('your professional network is running')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})