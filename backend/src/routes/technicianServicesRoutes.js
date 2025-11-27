import express from 'express'
import {
  getAllTechnicianServices,
  getTechnicianServiceById,
  createTechnicianService,
  deleteTechnicianService 
} from '../controllers/technicianServicesController.js'

const router = express.Router()

router.get('/', getAllTechnicianServices) 
router.get('/:id', getTechnicianServiceById)
router.post('/', createTechnicianService)
router.delete('/:id', deleteTechnicianService)

export default router
