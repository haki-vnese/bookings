import express from 'express'
import catchAsync from '../utils/catchAsync.js'
import validate from '../middleware/validate.js'
import { verifyAuth } from '../middleware/auth.js'
import { technicianServiceSchemas } from '../validation/schemas.js'
import {
  getAllTechnicianServices,
  getTechnicianServiceById,
  createTechnicianService,
  deleteTechnicianService 
} from '../controllers/technicianServicesController.js'

const router = express.Router()

router.get('/', catchAsync(getAllTechnicianServices)) 
router.get('/:id', catchAsync(getTechnicianServiceById))
router.post('/', validate(technicianServiceSchemas.create), verifyAuth, catchAsync(createTechnicianService))
router.delete('/:id', verifyAuth, catchAsync(deleteTechnicianService))

export default router
