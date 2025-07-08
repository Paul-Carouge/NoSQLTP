const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const { z } = require("zod");
const { createServer } = require("http");
const { Server } = require("socket.io");

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const port = 8000;
const client = new MongoClient("mongodb://localhost:27017");
let db;

app.use(express.json());
app.use(express.static('public'));

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
  
      const newProduct = {
        _id: ack.insertedId,
        name,
        about,
        price,
        categoryIds: categoryObjectIds,
      };

      // Émettre l'événement de création
      io.emit("products", { action: "created", product: newProduct });
  
      res.send(newProduct);
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

  // Récupérer un produit par ID
  app.get("/products/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const objectId = new ObjectId(id);
      
      const result = await db
        .collection("products")
        .aggregate([
          { $match: { _id: objectId } },
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
      
      if (result.length === 0) {
        return res.status(404).send({ error: "Produit non trouvé" });
      }
      
      res.send(result[0]);
    } catch (error) {
      res.status(400).send({ error: "ID invalide" });
    }
  });

  // Mettre à jour complètement un produit
  app.put("/products/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const objectId = new ObjectId(id);
      
      const result = await CreateProductSchema.safeParse(req.body);
      
      if (result.success) {
        const { name, about, price, categoryIds } = result.data;
        const categoryObjectIds = categoryIds.map((id) => new ObjectId(id));
        
        const updateResult = await db
          .collection("products")
          .replaceOne(
            { _id: objectId },
            { name, about, price, categoryIds: categoryObjectIds }
          );
        
        if (updateResult.matchedCount === 0) {
          return res.status(404).send({ error: "Produit non trouvé" });
        }
        
        const updatedProduct = { 
          _id: objectId, 
          name, 
          about, 
          price, 
          categoryIds: categoryObjectIds 
        };

        // Émettre l'événement de mise à jour
        io.emit("products", { action: "updated", product: updatedProduct });
        
        res.send(updatedProduct);
      } else {
        res.status(400).send(result);
      }
    } catch (error) {
      res.status(400).send({ error: "ID invalide" });
    }
  });

  // Mettre à jour partiellement un produit
  app.patch("/products/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const objectId = new ObjectId(id);
      
      const updateData = {};
      
      // Vérifier et ajouter chaque champ s'il est présent
      if (req.body.name !== undefined) {
        updateData.name = req.body.name;
      }
      if (req.body.about !== undefined) {
        updateData.about = req.body.about;
      }
      if (req.body.price !== undefined) {
        if (typeof req.body.price !== 'number' || req.body.price <= 0) {
          return res.status(400).send({ error: "Le prix doit être un nombre positif" });
        }
        updateData.price = req.body.price;
      }
      if (req.body.categoryIds !== undefined) {
        if (!Array.isArray(req.body.categoryIds)) {
          return res.status(400).send({ error: "categoryIds doit être un tableau" });
        }
        updateData.categoryIds = req.body.categoryIds.map((id) => new ObjectId(id));
      }
      
      if (Object.keys(updateData).length === 0) {
        return res.status(400).send({ error: "Aucun champ à mettre à jour" });
      }
      
      const updateResult = await db
        .collection("products")
        .updateOne(
          { _id: objectId },
          { $set: updateData }
        );
      
      if (updateResult.matchedCount === 0) {
        return res.status(404).send({ error: "Produit non trouvé" });
      }
      
      // Récupérer le produit mis à jour
      const updatedProduct = await db
        .collection("products")
        .aggregate([
          { $match: { _id: objectId } },
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
      
      // Émettre l'événement de mise à jour partielle
      io.emit("products", { action: "patched", product: updatedProduct[0] });
      
      res.send(updatedProduct[0]);
    } catch (error) {
      res.status(400).send({ error: "ID invalide" });
    }
  });

  // Supprimer un produit
  app.delete("/products/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const objectId = new ObjectId(id);
      
      const deleteResult = await db
        .collection("products")
        .deleteOne({ _id: objectId });
      
      if (deleteResult.deletedCount === 0) {
        return res.status(404).send({ error: "Produit non trouvé" });
      }
      
      // Émettre l'événement de suppression
      io.emit("products", { action: "deleted", productId: id });
      
      res.send({ message: "Produit supprimé avec succès" });
    } catch (error) {
      res.status(400).send({ error: "ID invalide" });
    }
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
  server.listen(port, () => {
    console.log(`Listening on http://localhost:${port}`);
  });
});

// Gestion des connexions Socket.io
io.on("connection", (socket) => {
  console.log("Un client s'est connecté:", socket.id);
  
  socket.on("disconnect", () => {
    console.log("Un client s'est déconnecté:", socket.id);
  });
});
