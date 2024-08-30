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
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '6h' })
      console.log(token)
      res.send({ token });
    })

    app.patch(`/users/admin/:id`, verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id
      const role=req.body.role;
      if (typeof role!=='string') {
        return res.status(400).send({error: "Invalid"})
      }
      const query = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          role: role
        }
      }
      const result = await usersCollection.updateOne(query, updateDoc)
      res.send(result);
    })

    app.get(`/user/admin/:email`, verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'unauthorized access wanted' })
      }
      const query = { email: email }
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin })
    })

    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
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

    app.get(`/user/:id`, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      console.log(query);
      const result = await usersCollection.findOne(query)
      res.send(result)
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

    app.post("/jobPost", async (req, res) => {
      const jobPost = req.body;
      console.log(jobPost);
      const result = await jobsCollection.insertOne(jobPost);
      res.send(result);
    })
    //for admin
    app.get('/allJobs', verifyToken, verifyAdmin, async (req, res) => {
      const result = await jobsCollection.find().sort({ _id: -1 }).toArray();
      res.send(result)
    })
    //for employer and entrepreneur
    app.get(`/pastJob/:id`, async (req, res) => {
      const id = req.params.id
      const query = { 'jobData.employerId': id }
      const result = await jobsCollection.find(query).toArray()
      res.send(result)
    })

    //for job seeker
    app.get(`/jobs/nonExpired/:userId`, async (req, res) => {
      const userId = req.params.userId
      try {
        if (!userId) {
          return res.status(400).send("User Id is required")
        }
        const currentDate = new Date().toISOString().split('T')[0];
        const appliedJobs = await applicantsCollection.find({ applicants: new ObjectId(userId) }).project({ jobId: 1, _id: 0 }).toArray()
        const appliedJobId = appliedJobs.map(job => job.jobId)

        const query = {
          "jobData.applicationDeadline": { $gte: currentDate }, _id: {
            $nin: appliedJobId
          }
        }
        const nonExpiredJobs = await jobsCollection.find(query).toArray()
        res.send(nonExpiredJobs)
      } catch (error) {
        console.log(error)
        res.send("error fetching job for user")
      }
    })

    app.get(`/jobs/applied/:userId`, async (req, res) => {
      const userId = req.params.userId
      try {
        if (!userId) {
          return res.status(400).send("User Id is required")
        }
        const currentDate = new Date().toISOString().split('T')[0];
        const appliedJobs = await applicantsCollection.find({ applicants: new ObjectId(userId) }).project({ jobId: 1, _id: 0 }).toArray()
        const appliedJobId = appliedJobs.map(job => job.jobId)

        const query = {
          "jobData.applicationDeadline": { $gte: currentDate }, _id: {
            $in: appliedJobId
          }
        }
        const nonExpiredJobs = await jobsCollection.find(query).sort({ "jobData.applicationDeadline": 1 }).toArray()
        res.send(nonExpiredJobs)
      } catch (error) {
        console.log(error)
        res.send("error fetching job for user")
      }
    })

    app.post(`/user/:userId/job/:jobId`, async (req, res) => {
      const userId = req.params.userId;
      const jobId = req.params.jobId;
      const applyData = {
        applicants: new ObjectId(userId),
        jobId: new ObjectId(jobId)
      }
      try {
        const isExistingApply = await applicantsCollection.findOne(applyData);
        if (isExistingApply) {
          return res.status(400).send({ message: 'applicant already applied for this job' });
        }
        const result = await applicantsCollection.insertOne(applyData)
        res.send(result)
      } catch (err) {
        console.log(err)
        res.send(err)
      }
    })

    app.get(`/employer/:employerId/jobsWithApplicants`, async (req, res) => {
      const employerId = req.params.employerId;
      const jobsWithApplicants = await jobsCollection.aggregate([
        {
          $match: { "jobData.employerId": employerId }
        },
        {
          $lookup: {
            from: 'applicants',
            localField: "_id",
            foreignField: "jobId",
            as: 'applicants'
          }
        },
        {
          $addFields: {
            numberOfApplications: {
              $cond: {
                if: { $isArray: '$applicants' },
                then: { $size: "$applicants" },
                else: 0,
              },
            },
            applicantIds: {
              $cond: {
                if: { $isArray: '$applicants' },
                then: {
                  $map: {
                    input: "$applicants",
                    as: 'applicant',
                    in: "$$applicant.applicants"
                  }
                },
                else: []
              },


            }
          }
        },
        {
          $project: {
            jobData: 1,
            numberOfApplications: 1,
            applicantIds: 1
          }
        }
      ]).toArray()
      res.send(jobsWithApplicants)
    })

    app.post('/postInvestment/:userId', verifyToken, async (req, res) => {
      const id = req.params.userId
      const investmentProposal = req.body;

      const result = await investmentProposalCollection.insertOne(investmentProposal)
      res.send(result)
    })

    app.get('/invest', async (req, res) => {
      const result = await investmentProposalCollection.find().sort({ _id: -1 }).toArray()
      res.send(result)
    })

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