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

const verifyToken = (req, res, next)=>{
    const token = req.cookies?.token;
    if(!token){
        return res.status(401).send({message: 'Unauthorized'})
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded)=>{
        if(err){
            return res.status(401).send({message: 'Unauthorized'})
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

        // Load all the campaigns excluding some fields
        app.get('/', async (req, res) => {
            const cursor = marathonsCollection.find().limit(6);
            const result = await cursor.toArray();
            res.send(result);
        });

        // Create JWT after sign in
        app.post('/jwt', (req, res)=>{
            const user = req.body;
            const token = jwt.sign(user, process.env.JWT_SECRET, {expiresIn: '5h'});
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite:  process.env.NODE_ENV === 'production' ? 'none' : 'strict'
            }).send({success: true})
        })

        // Clear cookie after logging out
        app.post('/logout', (req, res)=>{
            res.clearCookie('token', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite:  process.env.NODE_ENV === 'production' ? 'none' : 'strict'
            }).send({success: true})
        })

        //Adding new marathon
        app.post('/add-marathon', verifyToken, async(req, res)=>{
            const tokenEmail = req.user.email;
            if(tokenEmail !== req.body.creatorEmail){
                return res.status(403).send({message: "Forbidden Access"});
            }
            const result = await marathonsCollection.insertOne({...req.body, totalRegCount: 0});
            res.send(result)
        })

        // Load all marathons
        app.post('/marathons', verifyToken, async(req, res)=>{
            const tokenEmail = req.user.email;
            if(tokenEmail !== req.body.email){
                return res.status(403).send({message: "Forbidden Access"});
            }

            const cursor = marathonsCollection.find();
            const result = await cursor.toArray();
            res.send(result);

        });

        // Load single marathon data
        app.post('/marathons/:id', verifyToken, async(req, res)=>{
            const tokenEmail = req.user.email;
            if(tokenEmail !== req.body.email){
                return res.status(403).send({message: "Forbidden Access"});
            }
            const id = req.params.id;
            const query = {_id: new ObjectId(id)}
            const result = await marathonsCollection.findOne(query);
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