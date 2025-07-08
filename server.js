// All other imports here.
const { MongoClient } = require("mongodb");

const app = express();
const port = 8000;
const client = new MongoClient("mongodb://localhost:27017");
let db;

app.use(express.json());

// Schemas
const ProductSchema = z.object({
    _id: z.string(),
    name: z.string(),
    about: z.string(),
    price: z.number().positive(),
  });
  const CreateProductSchema = ProductSchema.omit({ _id: true });

  
// Ajouter un produit
app.post("/products", async (req, res) => {
    const result = await CreateProductSchema.safeParse(req.body);
  
    // Si Zod a réussi à parser le corps de la requête
    if (result.success) {
      const { name, about, price } = result.data;
  
      const ack = await db
        .collection("products")
        .insertOne({ name, about, price });
  
      res.send({ _id: ack.insertedId, name, about, price });
    } else {
      res.status(400).send(result);
    }
  });

// Init mongodb client connection
client.connect().then(() => {
  // Select db to use in mongodb
  db = client.db("myDB");
  app.listen(port, () => {
    console.log(`Listening on http://localhost:${port}`);
  });
});
