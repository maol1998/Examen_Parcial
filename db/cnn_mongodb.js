import mongoose from 'mongoose';
import 'colors';

let isConnected = false;
let connectionPromise = null;

const conectarAMongoDB = async () => {
    if (isConnected || mongoose.connection.readyState === 1) {
        return mongoose.connection;
    }

    if (connectionPromise) {
        return connectionPromise;
    }

    connectionPromise = mongoose
        .connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000
        })
        .then((conn) => {
            isConnected = true;
            console.log('Conectado a MongoDB'.green);
            return conn;
        })
        .catch((error) => {
            isConnected = false;
            console.log('Error al conectar a MongoDB:'.red, error.message || error);
            throw error;
        })
        .finally(() => {
            connectionPromise = null;
        });

    return connectionPromise;
};

const db = mongoose.connection;

db.on('error', (error) => {
    isConnected = false;
    console.log('Error en la conexión a MongoDB:'.red, error.message || error);
});

db.once('open', () => {
    isConnected = true;
});

db.on('disconnected', () => {
    isConnected = false;
    console.log('Desconectado de MongoDB'.yellow);
});

process.on('SIGINT', async () => {
    await mongoose.connection.close();
    console.log('MongoDB desconectado'.yellow);
    process.exit(0);
});

export { conectarAMongoDB, isConnected, isConnected as isConected };
