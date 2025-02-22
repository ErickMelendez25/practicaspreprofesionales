import express from 'express';
import mysql from 'mysql2';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import jwt from 'jsonwebtoken';

const app = express();
const port = 5000;

app.use(express.json());
app.use(cors());

// Configuración de almacenamiento de archivos con multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Asegúrate de que la carpeta 'uploads' exista
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // Limitar el tamaño a 10MB por archivo
  },
});

// Configuración de la base de datos
const db = mysql.createConnection({
  host: 'localhost',
  user: 'Erick',
  password: 'erickMV123@',
  database: 'universidad_continental'
});

db.connect((err) => {
  if (err) {
    console.error('Error al conectar a la base de datos:', err.stack);
    return;
  }
  console.log('Conexión a la base de datos exitosa');
  cifrarContraseñas();  // Llamar a la función para cifrar contraseñas si es necesario
});

// Función para generar el token
const generateToken = (user) => {
  const payload = { correo: user.correo, rol: user.rol };
  return jwt.sign(payload, 'secreta', { expiresIn: '1h' });
};

app.post('/login', (req, res) => {
  const { correo, password } = req.body;

  if (!correo || !password) {
    return res.status(400).json({ message: 'Correo y contraseña son requeridos' });
  }

  db.query('SELECT * FROM usuarios WHERE correo = ?', [correo], (err, result) => {
    if (err) {
      console.error('Error al consultar el usuario:', err);
      return res.status(500).json({ message: 'Error en el servidor' });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const user = result[0];

    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err) {
        console.error('Error al comparar las contraseñas:', err);
        return res.status(500).json({ message: 'Error en el servidor' });
      }

      if (!isMatch) {
        return res.status(400).json({ message: 'Contraseña incorrecta' });
      }

      // Obtener el id_estudiante de la tabla estudiantes usando el correo
      db.query('SELECT id FROM estudiantes WHERE correo = ?', [user.correo], (err, studentResult) => {
        if (err) {
          console.error('Error al consultar el estudiante:', err);
          return res.status(500).json({ message: 'Error en el servidor' });
        }
        

        const id_estudiante = studentResult.length > 0 ? studentResult[0].id : null;

        const token = generateToken(user);
        res.status(200).json({
          message: 'Login exitoso',
          token,
          usuario: {
            correo: user.correo,
            rol: user.rol,
            id_estudiante: id_estudiante  // Incluye id_estudiante aquí
          }
        });
      });
    });
  });
});


// Ruta para registrar un usuario (con contraseña cifrada)
app.post('/register', (req, res) => {
  const { correo, password, rol } = req.body;

  if (!correo || !password || !rol) {
    return res.status(400).json({ message: 'Correo, contraseña y rol son requeridos' });
  }

  // Cifrar la contraseña
  bcrypt.hash(password, 10, (err, hashedPassword) => {
    if (err) {
      console.error('Error al cifrar la contraseña:', err);
      return res.status(500).json({ message: 'Error en el servidor' });
    }

    // Insertar el nuevo usuario con la contraseña cifrada
    db.query('INSERT INTO usuarios (correo, password, rol) VALUES (?, ?, ?)', 
    [correo, hashedPassword, rol], (err, result) => {
      if (err) {
        console.error('Error al guardar el usuario:', err);
        return res.status(500).json({ message: 'Error al guardar el usuario' });
      }
      res.status(201).json({ message: 'Usuario registrado exitosamente' });
    });
  });
});

// Ruta para registrar la práctica (subir los archivos y agregar estado)
// Ruta para registrar la práctica (subir los archivos y agregar estado)
app.post('/api/practicas', upload.fields([
  { name: 'solicitud', maxCount: 1 },
  { name: 'planPracticas', maxCount: 1 }
]), (req, res) => {
  const { id_estudiante, comentarios, estado_proceso } = req.body;

  // Verifica que id_estudiante no sea undefined
  if (!id_estudiante) {
    return res.status(400).json({ message: 'El ID del estudiante es requerido' });
  }

  if (!req.files || !req.files.solicitud || !req.files.planPracticas) {
    return res.status(400).json({ message: 'Ambos archivos son necesarios' });
  }

  const solicitud = req.files.solicitud[0].path;
  const planPracticas = req.files.planPracticas[0].path;

  // Aquí, asegúrate de que el estado_proceso sea un valor simple, no un objeto JSON
  const estado = JSON.parse(estado_proceso);  // Si envías un objeto JSON, lo parseas aquí
  const estadoFinal = estado[Object.keys(estado)[0]] || 'Pendiente';  // Toma el primer valor del objeto o 'Pendiente' como predeterminado

  // Inserta en la base de datos
  db.query('INSERT INTO practicas (id_estudiante, solicitud_inscripcion, plan_practicas, estado_proceso, comentarios) VALUES (?, ?, ?, ?, ?)', 
    [id_estudiante, solicitud, planPracticas, estadoFinal, comentarios], 
    (err, result) => {
      if (err) {
        console.error('Error al guardar en la base de datos:', err);
        return res.status(500).json({ message: 'Error al guardar en la base de datos' });
      }
      res.status(200).json({ message: 'Prácticas enviadas con éxito' });
    });
});



// Ruta para obtener las prácticas
app.get('/api/practicas', (req, res) => {
  db.query('SELECT p.id, p.id_estudiante, e.correo, p.solicitud_inscripcion, p.plan_practicas, p.fecha_inicio, p.fecha_fin, p.estado_proceso FROM practicas p JOIN estudiantes e ON p.id_estudiante = e.id;', (err, result) => {
    if (err) {
      console.error('Error al obtener las prácticas:', err);
      return res.status(500).json({ message: 'Error en el servidor' });
    }
    res.json(result);
  });
});

// Ruta para actualizar el estado de la práctica
// Ejemplo de cómo podrías manejar la solicitud PUT en tu servidor (Node.js/Express)
// Ruta para actualizar el estado de la práctica
app.put('/api/actualizar-estado', (req, res) => {
  const { idPractica, estado, comentarios } = req.body;

  // Mostrar los datos recibidos para depuración
  console.log('Datos recibidos en el servidor:', { idPractica, estado, comentarios });

  // Validación de los datos recibidos
  if (!idPractica || !estado || !comentarios) {
    return res.status(400).json({ message: 'Faltan datos requeridos.' });
  }

  // Si los datos son válidos, proceder con la actualización en la base de datos
  db.query(
    'UPDATE practicas SET estado_proceso = ?, comentarios = ? WHERE id = ?',
    [estado, comentarios, idPractica],
    (err, result) => {
      if (err) {
        console.error('Error al actualizar el estado de la práctica:', err);
        return res.status(500).json({ message: 'Error al actualizar el estado' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Práctica no encontrada.' });
      }

      res.status(200).json({ message: 'Estado actualizado correctamente.' });
    }
  );
});


// Función para cifrar todas las contraseñas de los usuarios
const cifrarContraseñas = () => {
  db.query('SELECT * FROM usuarios WHERE password NOT LIKE "$2a$%"', (err, result) => {
    if (err) {
      console.error('Error al obtener usuarios:', err);
      return;
    }

    if (result.length === 0) {
      console.log('No se encontraron usuarios con contraseñas en texto plano');
      return;
    }

    result.forEach(user => {
      const plainPassword = user.password;

      bcrypt.hash(plainPassword, 10, (err, hashedPassword) => {
        if (err) {
          console.error('Error al cifrar la contraseña del usuario', user.id, ':', err);
          return;
        }

        db.query('UPDATE usuarios SET password = ? WHERE id = ?', [hashedPassword, user.id], (err, updateResult) => {
          if (err) {
            console.error('Error al actualizar la contraseña del usuario', user.id, ':', err);
            return;
          }

          console.log('Contraseña del usuario', user.id, 'actualizada con éxito');
        });
      });
    });
  });
};

app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});
