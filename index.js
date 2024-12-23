require('dotenv').config();
const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ynkon.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// Middleware
app.use(cors({
    origin: "http://localhost:5173",
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

const verifyToken = (req, res, next) => {
    const token = req.cookies?.token;
    if (!token) {
        return res.status(401).send({ message: 'Unauthorized' })
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'Unauthorized' })
        }
        req.user = decoded;
        next();
    })
}

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");


        const database = client.db("marathon-bold");
        const marathonsCollection = database.collection("marathons");
        const applicationsCollection = database.collection("applications");

        // Load all the campaigns excluding some fields
        app.get('/', async (req, res) => {
            const cursor = marathonsCollection.find().limit(6);
            const result = await cursor.toArray();
            res.send(result);
        });

        // Load applications of a logged in user
        app.get('/my-applications', verifyToken, async (req, res) => {
            const tokenEmail = req.user.email;
            if (tokenEmail !== req.query.email) {
                return res.status(403).send({ message: "Forbidden Access" });
            }
            const search = req.query.search;
            const query = { email: tokenEmail }
            if(search){
                query.marathonTitle = {$regex : search, $options : 'i'}
            }

            const cursor = applicationsCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);

        });

        // Update application of logged in user
        app.patch('/update-application', verifyToken, async (req, res) => {
            const tokenEmail = req.user.email;
            if (tokenEmail !== req.body.ownerVerify.creatorEmail) {
                return res.status(403).send({ message: "Forbidden Access" });
            }

            const doc = req.body.doc;
            const id = req.body.ownerVerify.id;
            const filter = { _id: new ObjectId(id) }
            const options = { upsert: true }
            const updateDoc = {
                $set: { ...doc }
            }

            const result = await applicationsCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        })

        // Delete application
        app.delete('/my-applications/delete', verifyToken, async (req, res) => {
            const tokenEmail = req.user.email;
            if (tokenEmail !== req.query.creatorEmail) {
                return res.status(403).send({ message: "Forbidden Access" });
            }

            const id = req.query.id;
            const query = { _id: new ObjectId(id) }
            const result = await applicationsCollection.deleteOne(query);

            const filterMarathon = { _id: new ObjectId(req.query.marathonId) }
            const getMarathon = await marathonsCollection.findOne(filterMarathon, {projection: { totalRegCount: 1 }});
            
            const updateDoc = {
                $set: {totalRegCount: getMarathon.totalRegCount-1}
            }
            const options = { upsert: true }

            await marathonsCollection.updateOne(filterMarathon, updateDoc, options);

            res.send(result);
        })

        // Create JWT after sign in
        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '5h' });
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
            }).send({ success: true })
        })

        // Clear cookie after logging out
        app.post('/logout', (req, res) => {
            res.clearCookie('token', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
            }).send({ success: true })
        })

        //Adding new marathon
        app.post('/add-marathon', verifyToken, async (req, res) => {
            const tokenEmail = req.user.email;
            if (tokenEmail !== req.body.creatorEmail) {
                return res.status(403).send({ message: "Forbidden Access" });
            }
            const result = await marathonsCollection.insertOne({ ...req.body, totalRegCount: 0 });
            res.send(result)
        })

        // Load all marathons
        app.post('/marathons', verifyToken, async (req, res) => {
            const tokenEmail = req.user.email;
            if (tokenEmail !== req.body.email) {
                return res.status(403).send({ message: "Forbidden Access" });
            }

            const cursor = marathonsCollection.find();
            const result = await cursor.toArray();
            res.send(result);

        });

        // Load single marathon data
        app.post('/marathons/:id', verifyToken, async (req, res) => {
            const tokenEmail = req.user.email;
            if (tokenEmail !== req.body.email) {
                return res.status(403).send({ message: "Forbidden Access" });
            }
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await marathonsCollection.findOne(query);
            res.send(result);
        });

        // Add new application
        app.post('/marathon-apply', verifyToken, async (req, res) => {
            const tokenEmail = req.user.email;
            const body = req.body;
            if (tokenEmail !== body.applyData.email) {
                return res.status(403).send({ message: "Forbidden Access" });
            }

            const id = body.forMarathonUpdate.id;

            const result = await applicationsCollection.insertOne({ ...body.applyData, marathonId: id });
            const filter = { _id: new ObjectId(id) }
            const options = { upsert: true }
            const updateDoc = {
                $set: { totalRegCount: parseInt(body.forMarathonUpdate.totalReg) + 1 }
            }
            await marathonsCollection.updateOne(filter, updateDoc, options);

            res.send(result)
        })

        // Load marathons created by logged in user
        app.get('/my-marathons', verifyToken, async (req, res) => {
            const tokenEmail = req.user.email;
            const queryEmail = req.query.email;
            if (tokenEmail !== queryEmail) {
                return res.status(403).send({ message: "Forbidden Access" });
            }

            const query = { creatorEmail: queryEmail }
            const cursor = marathonsCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        })

        // Update single marathon
        app.patch('/my-marathons/update', verifyToken, async (req, res) => {
            const tokenEmail = req.user.email;
            const creator = req.body.ownerVerify.creatorEmail;
            if (tokenEmail !== creator) {
                return res.status(403).send({ message: "Forbidden Access" });
            }

            const doc = req.body.doc;
            const id = req.body.ownerVerify.id;
            const filter = { _id: new ObjectId(id) }
            const options = { upsert: true }
            const updateDoc = {
                $set: { ...doc }
            }

            const result = await marathonsCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        });

        // Delete a marathon
        app.delete("/my-marathons/delete", verifyToken, async (req, res) => {
            const tokenEmail = req.user.email;
            const creator = req.query.creatorEmail;
            if (tokenEmail !== creator) {
                return res.status(403).send({ message: "Forbidden Access" });
            }

            const id = req.query.id;
            const query = { _id: new ObjectId(id) }
            const result = await marathonsCollection.deleteOne(query);
            res.send(result);
        })


    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.listen(port, () => {
    console.log(`Server is running at ${port}`)
})