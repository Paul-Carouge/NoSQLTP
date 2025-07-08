const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const { z } = require("zod");

const app = express();
const port = 8000;
const client = new MongoClient("mongodb://localhost:27017");
let db;

app.use(express.json());

// Schema pour les produits
const ProductSchema = z.object({
    _id: z.string(),
    name: z.string(),
    about: z.string(),
    price: z.number().positive(),
    categoryIds: z.array(z.string())
  });
  const CreateProductSchema = ProductSchema.omit({ _id: true });
  const CategorySchema = z.object({
    _id: z.string(),
    name: z.string(),
  });
  const CreateCategorySchema = CategorySchema.omit({ _id: true });
  

  // Ajouter un produit
  app.post("/products", async (req, res) => {
    const result = await CreateProductSchema.safeParse(req.body);
  
    // Si Zod a réussi à parser le corps de la requête
    if (result.success) {
      const { name, about, price, categoryIds } = result.data;
      const categoryObjectIds = categoryIds.map((id) => new ObjectId(id));
  
      const ack = await db
        .collection("products")
        .insertOne({ name, about, price, categoryIds: categoryObjectIds });
  
      res.send({
        _id: ack.insertedId,
        name,
        about,
        price,
        categoryIds: categoryObjectIds,
      });
    } else {
      res.status(400).send(result);
    }
  });

  // Récupérer tous les produits
  app.get("/products", async (req, res) => {
    const result = await db
      .collection("products")
      .aggregate([
        { $match: {} },
        {
          $lookup: {
            from: "categories",
            localField: "categoryIds",
            foreignField: "_id",
            as: "categories",
          },
        },
      ])
      .toArray();
  
    res.send(result);
  });

  // Ajouter une catégorie
  app.post("/categories", async (req, res) => {
    const result = await CreateCategorySchema.safeParse(req.body);
  
    // Si Zod a réussi à parser le corps de la requête
    if (result.success) {
      const { name } = result.data;
  
      const ack = await db.collection("categories").insertOne({ name });
  
      res.send({ _id: ack.insertedId, name });
    } else {
      res.status(400).send(result);
    }
  });

  // Récupérer toutes les catégories
  app.get("/categories", async (req, res) => {
    const result = await db.collection("categories").find().toArray();
    res.send(result);
  });

// Initialisation de la connexion à MongoDB
client.connect().then(() => {
  // Sélection de la base de données à utiliser dans MongoDB
  db = client.db("myDB");
  app.listen(port, () => {
    console.log(`Listening on http://localhost:${port}`);
  });
});
